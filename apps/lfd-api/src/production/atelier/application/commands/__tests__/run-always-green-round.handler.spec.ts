import { localToInstant } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  article,
  FailingWorkstationOfProducts,
  placementPorts,
} from "../../../../workstations/application/__tests__/placement-doubles.js";
import type { WorkstationOfProducts } from "../../../../workstations/index.js";
import type { LineStepKey } from "../../../domain/entities/line-step.js";
import { AutomaticStepChecks } from "../../../domain/ports/line-step.ports.js";
import { mapOf, SCENE_PRODUCT, STEP_STATION } from "../../__tests__/line-step-scene.js";
import { AlwaysGreenStepsRound } from "../../services/always-green-steps.service.js";
import { ProductionDayStatusReader, type ServiceDay } from "../../../../day/index.js";
import { AlwaysGreenLineRunner } from "../../../domain/ports/always-green-line-runner.js";
import type { TrackingLevelsCommissioning } from "../../../domain/ports/tracking-levels-commissioning.js";
import type { AlwaysGreenLineOutcome } from "../../../domain/services/always-green.js";
import { alwaysGreenScene, BAGUETTE } from "../../__tests__/always-green-scene.js";
import { SCENE_DAY, SCENE_SKU } from "../../__tests__/problem-scene.js";
import {
  FixedCommissioning,
  LONG_AGO,
  trackingReadingOf,
} from "../../__tests__/tracking-doubles.js";
import { DayTrackingLevelsFreezing } from "../../services/day-tracking-levels-freezing.service.js";
import { RunAlwaysGreenLineCommand } from "../run-always-green-line.command.js";
import { RunAlwaysGreenRoundHandler } from "../run-always-green-round.handler.js";

/** Le tour de la fournée automatique (`fournil/les-niveaux-de-suivi.md`), ports doublés. */

/** Les journées arrêtées, par jour. */
class ArrestedDays extends ProductionDayStatusReader {
  constructor(private readonly arrested: readonly string[]) {
    super();
  }

  isClosed(day: ServiceDay): Promise<boolean> {
    return Promise.resolve(this.arrested.includes(day.value));
  }
}

/** Le passage d'une ligne : la vraie commande, sauf pour les SKU qui lèvent. */
class Runner extends AlwaysGreenLineRunner {
  readonly calls: string[] = [];

  constructor(
    private readonly real: (command: RunAlwaysGreenLineCommand) => Promise<AlwaysGreenLineOutcome>,
    private readonly failing: readonly string[] = [],
  ) {
    super();
  }

  run(day: ServiceDay, sku: string): Promise<AlwaysGreenLineOutcome> {
    this.calls.push(`${day.value}:${sku}`);
    return this.failing.includes(sku)
      ? Promise.reject(new Error(`panne sur ${sku}`))
      : this.real(new RunAlwaysGreenLineCommand(day.value, sku));
  }
}

function roundOn(options: {
  readonly arrested?: readonly string[];
  readonly failing?: readonly string[];
  readonly commissioning?: TrackingLevelsCommissioning;
  /** La carte des postes : par défaut, aucun produit n'a de poste. */
  readonly map?: WorkstationOfProducts;
  /** La coche d'office : par défaut, la table en mémoire de la scène. */
  readonly checks?: AutomaticStepChecks;
}) {
  const scene = alwaysGreenScene(
    undefined,
    options.map === undefined
      ? undefined
      : placementPorts(
          [article(SCENE_SKU, SCENE_PRODUCT, { id: "f", name: "Viennoiseries", position: 0 })],
          options.map,
        ),
  );
  const commissioning = options.commissioning ?? LONG_AGO;
  const instant = localToInstant(SCENE_DAY, "10:00");
  if (instant === null) {
    throw new RangeError("10:00");
  }
  scene.clock.set(instant);
  const freezing = new DayTrackingLevelsFreezing(
    new DirectUnitOfWork(),
    scene.lock,
    scene.days,
    scene.frozen.reader(),
    scene.frozen.freezer(),
    trackingReadingOf({ frozen: scene.frozen, commissioning }),
    commissioning,
    scene.clock,
  );
  const runner = new Runner((command) => scene.line.execute(command), options.failing);
  const round = new RunAlwaysGreenRoundHandler(
    scene.clock,
    new ArrestedDays(options.arrested ?? [SCENE_DAY]),
    freezing,
    scene.days,
    scene.lines,
    runner,
    commissioning,
    scene.deadlines,
    scene.trackingSettings.reader(),
    scene.problems.dayReader(),
    options.checks === undefined
      ? scene.stepsRound
      : new AlwaysGreenStepsRound(scene.steps.dayReader(), options.checks),
  );
  return { scene, runner, round };
}

describe("RunAlwaysGreenRoundHandler", () => {
  it("aujourd'hui arrêté : fige le niveau, passe chaque ligne, dit celles à confirmer", async () => {
    const { scene, runner, round } = roundOn({});

    const report = await round.execute();

    expect(scene.frozen.rows.has(SCENE_DAY)).toBe(true);
    // Seule la ligne qui a une fournée à déclarer passe sous le verrou ; la
    // baguette, sans palier, est triée « à confirmer » sans lecture de plus.
    expect(runner.calls).toEqual([`${SCENE_DAY}:${SCENE_SKU}`]);
    expect(report.days[0]).toEqual({
      serviceDay: SCENE_DAY,
      arrested: true,
      recorded: [SCENE_SKU],
      toConfirm: [BAGUETTE],
      failed: [],
      error: null,
      steps: { checked: 0, toConfirm: [] },
    });
    // Demain n'est pas arrêté : rien n'y est touché.
    expect(report.days[1]).toMatchObject({ arrested: false, recorded: [], error: null });
  });

  it("une ligne en erreur est isolée : les autres continuent", async () => {
    const { scene, round } = roundOn({ failing: [SCENE_SKU] });

    const report = await round.execute();

    expect(report.days[0]).toMatchObject({ failed: [SCENE_SKU], toConfirm: [BAGUETTE] });
    expect(scene.store.batches).toEqual([]);
  });

  it("une journée non arrêtée n'est ni figée ni passée", async () => {
    const { scene, runner, round } = roundOn({ arrested: [] });

    await round.execute();

    expect(runner.calls).toEqual([]);
    expect(scene.frozen.attempts).toEqual([]);
  });

  it("une journée arrêtée avant la mise en service n'est jamais touchée", async () => {
    const { scene, runner, round } = roundOn({
      commissioning: new FixedCommissioning(new Date(afterTheArrest())),
    });
    // Le tour passe après la mise en service ; la journée a été arrêtée avant.
    scene.clock.set(new Date(afterTheArrest() + 3_600_000));
    let loads = 0;
    const load = scene.days.load.bind(scene.days);
    scene.days.load = () => {
      loads += 1;
      return load();
    };

    const report = await round.execute();

    expect(runner.calls).toEqual([]);
    expect(scene.frozen.attempts).toEqual([]);
    expect(report.days[0]).toMatchObject({ arrested: true, recorded: [], toConfirm: [] });
    // Une fois pour le figement, jamais pour les lignes : tout est en détaillé.
    expect(loads).toBe(1);
  });

  it("avant la mise en service, le tour ne lit aucune journée", async () => {
    const { scene, runner, round } = roundOn({
      commissioning: new FixedCommissioning(new Date(afterTheArrest() + 24 * 3_600_000)),
    });
    let loads = 0;
    const load = scene.days.load.bind(scene.days);
    scene.days.load = () => {
      loads += 1;
      return load();
    };

    const report = await round.execute();

    expect(report.days).toEqual([]);
    expect(runner.calls).toEqual([]);
    expect(loads).toBe(0);
  });
});

/** La clé de l'étape du croissant, faite par la Boulangerie. */
const BREAD_STEP: LineStepKey = {
  serviceDay: SCENE_DAY,
  sku: SCENE_SKU,
  workstationId: STEP_STATION,
};

/** La coche d'office en panne. */
class FailingStepChecks extends AutomaticStepChecks {
  checkIfAbsent(): Promise<number> {
    return Promise.reject(new Error("table des étapes injoignable"));
  }
}

describe("RunAlwaysGreenRoundHandler — les étapes (un-produit-sur-plusieurs-postes, § 2.4)", () => {
  it("coche d'office l'étape échue d'un poste en toujours vert ; la fournée part de son côté", async () => {
    const { scene, round } = roundOn({ map: mapOf() });

    const report = await round.execute();

    expect(report.days[0]).toMatchObject({
      recorded: [SCENE_SKU],
      steps: { checked: 1, toConfirm: [] },
    });
    expect(scene.steps.of(BREAD_STEP)).toMatchObject({
      status: "done",
      checked: { staffId: "system:always-green", name: null },
      version: 1,
    });
    // Une étape ne compte aucune pièce : la fournée seule a déclaré.
    expect((await scene.days.load()).producedOf(SCENE_SKU)).toBe(16);
  });

  it("une étape déjà touchée par quelqu'un n'est pas réécrite", async () => {
    const { scene, round } = roundOn({ map: mapOf() });
    const undone = {
      ...BREAD_STEP,
      status: "undone" as const,
      reason: null,
      checked: { at: new Date(0), staffId: "staff-1", name: "Marie" },
      version: 2,
    };
    scene.steps.seed(undone);

    const report = await round.execute();

    expect(report.days[0]?.steps).toEqual({ checked: 0, toConfirm: [] });
    expect(scene.steps.of(BREAD_STEP)).toEqual(undone);
    expect(scene.steps.automatic).toEqual([[]]);
  });

  it("des postes illisibles : aucune étape n'est cochée, les fournées partent", async () => {
    const { scene, round } = roundOn({ map: new FailingWorkstationOfProducts() });

    const report = await round.execute();

    expect(report.days[0]).toMatchObject({
      recorded: [SCENE_SKU],
      steps: { checked: 0, toConfirm: [] },
    });
    expect(scene.steps.rows.size).toBe(0);
  });

  it("la coche d'office en panne : journalisée, les fournées restent faites", async () => {
    const { round } = roundOn({ map: mapOf(), checks: new FailingStepChecks() });

    const report = await round.execute();

    expect(report.days[0]).toMatchObject({ recorded: [SCENE_SKU], steps: null, error: null });
  });
});

/** Une mise en service postérieure à l'arrêt de la journée de la scène. */
function afterTheArrest(): number {
  const instant = localToInstant(SCENE_DAY, "12:00");
  if (instant === null) {
    throw new RangeError("12:00");
  }
  return instant.getTime();
}
