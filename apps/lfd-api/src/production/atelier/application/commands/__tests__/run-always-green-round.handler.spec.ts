import { localToInstant } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";
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
import { AlwaysGreenLines } from "../../services/always-green-lines.service.js";
import { DayTrackingLevelsFreezing } from "../../services/day-tracking-levels-freezing.service.js";
import { WorksheetTrackingLevelsReading } from "../../services/worksheet-tracking-levels.js";
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
}) {
  const scene = alwaysGreenScene();
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
    new AlwaysGreenLines(
      new WorksheetTrackingLevelsReading(new GroupingSourceReading(...placementPorts())),
    ),
    runner,
    commissioning,
    scene.deadlines,
    scene.trackingSettings.reader(),
    scene.problems.dayReader(),
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
    scene.days.load = (day) => {
      loads += 1;
      return load(day);
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
    scene.days.load = (day) => {
      loads += 1;
      return load(day);
    };

    const report = await round.execute();

    expect(report.days).toEqual([]);
    expect(runner.calls).toEqual([]);
    expect(loads).toBe(0);
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
