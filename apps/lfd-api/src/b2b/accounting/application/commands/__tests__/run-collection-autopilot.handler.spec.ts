import {
  CollectionFloorMissingError,
  CollectionNotYetOpenError,
  NothingToCollectError,
} from "../../../domain/errors/collection-errors.js";
import { AutomaticCollectionConstituter } from "../../../domain/ports/automatic-collection-constituter.js";
import type { SettledAutopilotOutcome } from "../../../domain/ports/collection-autopilot-runs.js";
import {
  ENTITY_ID,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import {
  AFTER_PLANNED,
  BEFORE_PLANNED,
  CLOSE,
  ENTITY,
  ScriptedConstituter,
  autopilot,
  key,
} from "./collection-autopilot-doubles.js";
import { world } from "./collection-world.js";

describe("le passage de la constitution automatique (PA3)", () => {
  it("constitue une fois l'heure passée, range l'issue et la journalise", async () => {
    const constituter = new ScriptedConstituter(["b1", "b2"]);
    const { handler, runs, events } = autopilot(constituter);

    const report = await handler.execute();

    expect(constituter.calls).toEqual([ENTITY_ID]);
    expect(runs.of(ENTITY_ID)).toEqual({ outcome: "constituted", message: null });
    expect(report.runs).toEqual([
      { legalEntityId: ENTITY_ID, cycleClosesAt: CLOSE.toISOString(), outcome: "constituted" },
    ]);
    expect(events.factTypes()).toEqual(["collection.autopilot_ran"]);
  });

  it("une seule tentative par cycle : le passage suivant lit la table et se tait", async () => {
    const constituter = new ScriptedConstituter(new NothingToCollectError(0));
    const { handler, runs, events } = autopilot(constituter);

    await handler.execute();
    const second = await handler.execute();

    expect(constituter.calls).toHaveLength(1);
    expect(second.runs).toEqual([]);
    expect(runs.reads).toEqual([ENTITY_ID, ENTITY_ID]);
    expect(events.factTypes()).toEqual(["collection.autopilot_ran"]);
  });

  it("l'heure prévue pas encore passée : ni lecture, ni constitution", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, runs } = autopilot(constituter, BEFORE_PLANNED);

    expect((await handler.execute()).runs).toEqual([]);
    expect(constituter.calls).toEqual([]);
    expect(runs.reads).toEqual([]);
  });

  it("une entité désactivée n'est pas lue : le lecteur ne la rend pas", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, runs } = autopilot(constituter, AFTER_PLANNED, []);

    await handler.execute();

    expect(constituter.calls).toEqual([]);
    expect(runs.rows.size).toBe(0);
  });

  it("un autre passage a pris la tentative entre la lecture et l'insertion : rien", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, runs } = autopilot(constituter);
    runs.attempted = () => Promise.resolve(false);
    runs.rows.set(key(ENTITY_ID, CLOSE), { outcome: "pending", message: null });

    expect((await handler.execute()).runs).toEqual([]);
    expect(constituter.calls).toEqual([]);
  });

  it.each<[string, Error, SettledAutopilotOutcome]>([
    ["rien à prélever", new NothingToCollectError(0), "nothing_to_collect"],
    [
      "le plancher",
      new CollectionNotYetOpenError(new Date("2026-10-05T10:00:00.000Z"), CLOSE),
      "not_yet_open",
    ],
    ["une panne", new CollectionFloorMissingError(), "failed"],
  ])("%s : l'issue est rangée avec le message du refus", async (_, error, outcome) => {
    const { handler, runs, events } = autopilot(new ScriptedConstituter(error));

    await handler.execute();

    expect(runs.of(ENTITY_ID)).toEqual({ outcome, message: error.message });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      outcome,
      message: error.message,
      batchCount: 0,
    });
  });

  it("une constitution qui n'a fait qu'écarter : « rien à prélever », expliqué", async () => {
    const { handler, runs } = autopilot(new ScriptedConstituter([]));

    await handler.execute();

    expect(runs.of(ENTITY_ID)?.outcome).toBe("nothing_to_collect");
    expect(runs.of(ENTITY_ID)?.message).toContain("écartées");
  });

  it("l'échec d'une entité n'empêche pas les autres", async () => {
    class OneFails extends AutomaticCollectionConstituter {
      constitute(legalEntityId: string): Promise<readonly string[]> {
        return legalEntityId === "le_casse"
          ? Promise.reject(new CollectionFloorMissingError())
          : Promise.resolve(["b1"]);
      }
    }
    const { handler } = autopilot(new OneFails(), AFTER_PLANNED, [
      { ...ENTITY, legalEntityId: "le_casse" },
      ENTITY,
    ]);

    const report = await handler.execute();

    expect(report.runs.map((run) => run.outcome)).toEqual(["failed", "constituted"]);
  });

  it("la vraie constitution, auteur `system` : le lot ne nomme aucune fiche staff", async () => {
    const w = world();
    w.clock.set(AFTER_PLANNED);
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    class ThroughHandler extends AutomaticCollectionConstituter {
      constitute(legalEntityId: string): Promise<readonly string[]> {
        return w.constitute.execute(
          new ConstituteCollectionBatchesCommand(legalEntityId, { kind: "system" }),
        );
      }
    }
    const { handler } = autopilot(new ThroughHandler());

    await handler.execute();

    const [batch] = [...w.batches.saved.values()];
    expect(batch?.toPersistence().constituted.by).toEqual({ kind: "system" });
    // Les avis partent comme pour le bouton (PA2).
    expect(w.events.factTypes()).toContain("collection.notice_queued");
  });

  describe("sur le calendrier de la facture : un payeur hebdomadaire du lundi (R4, M3)", () => {
    const weekly = [
      {
        payerCompanyId: "c_port",
        segments: [{ effectiveFrom: paris("2026-09-01"), mode: "weekly" as const }],
      },
    ];
    /** Lundi 5 et lundi 12 octobre 2026, 00h00 Paris. */
    const MONDAY_5 = new Date("2026-10-04T22:00:00.000Z");
    const MONDAY_12 = new Date("2026-10-11T22:00:00.000Z");

    it("l'entité est tentée à chaque lundi, une fois chacun", async () => {
      const constituter = new ScriptedConstituter(["b1"]);
      const first = autopilot(constituter, new Date("2026-10-05T08:00:00.000Z"), [ENTITY], weekly);
      const second = autopilot(constituter, new Date("2026-10-12T08:00:00.000Z"), [ENTITY], weekly);

      const reports = [await first.handler.execute()];
      first.runs.rows.forEach((row, k) => second.runs.rows.set(k, row));
      reports.push(await second.handler.execute(), await second.handler.execute());

      expect(reports.map((report) => report.runs.map((run) => run.cycleClosesAt))).toEqual([
        [MONDAY_5.toISOString()],
        [MONDAY_12.toISOString()],
        [],
      ]);
      expect(constituter.calls).toEqual([ENTITY_ID, ENTITY_ID]);
    });
  });
});
