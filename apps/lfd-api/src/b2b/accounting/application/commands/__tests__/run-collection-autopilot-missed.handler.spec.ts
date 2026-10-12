import { NothingToCollectError } from "../../../domain/errors/collection-errors.js";
import { ENTITY_ID } from "../../../domain/services/__tests__/collection-fixtures.js";
import {
  AFTER_PLANNED,
  CLOSE,
  ScriptedConstituter,
  autopilot,
  key,
} from "./collection-autopilot-doubles.js";

/**
 * **Une clôture manquée suspend l'automatisme** (plan
 * `plan-rythme-de-facturation.md`, §14, lot R4b — Hugo, 2026-10-12 : « un lot
 * manqué se signale et se refait à la main »).
 *
 * Mensuel au 1er : CLOSE est le 1er octobre 2026 ; AUGUST_CLOSE et JULY_CLOSE
 * les deux clôtures d'avant. Les instants ne sont comparés qu'entre eux.
 */
const AUGUST_CLOSE = new Date("2026-08-31T22:00:00.000Z");
const JULY_CLOSE = new Date("2026-07-31T22:00:00.000Z");
const FLOOR = new Date("2026-06-01T08:00:00.000Z");

function seeded(constituter: ScriptedConstituter) {
  const world = autopilot(constituter);
  world.coverage.floorAt = FLOOR;
  world.runs.rows.set(key(ENTITY_ID, JULY_CLOSE), { outcome: "constituted", message: null });
  return world;
}

describe("une clôture manquée (R4b)", () => {
  it("ne constitue pas : range `missed`, nomme la clôture et le geste, journalise", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, runs, events } = seeded(constituter);

    const report = await handler.execute();

    expect(constituter.calls).toEqual([]);
    expect(report.runs).toEqual([
      { legalEntityId: ENTITY_ID, cycleClosesAt: CLOSE.toISOString(), outcome: "missed" },
    ]);
    const message = runs.of(ENTITY_ID)?.message ?? "";
    expect(runs.of(ENTITY_ID)?.outcome).toBe("missed");
    expect(message).toContain("1er septembre 2026");
    expect(message).toContain("Préparer le lot");
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "collection.autopilot_ran",
      payload: { outcome: "missed", batchCount: 0, message },
    });
  });

  it("une seule tentative par clôture : le passage suivant se tait", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, events } = seeded(constituter);

    await handler.execute();

    expect((await handler.execute()).runs).toEqual([]);
    expect(events.factTypes()).toEqual(["collection.autopilot_ran"]);
  });

  it("après « Préparer le lot » à la main, plus rien n'est manqué", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, coverage } = seeded(constituter);
    coverage.lastLiveBatchClosesAt = AUGUST_CLOSE;

    expect((await handler.execute()).runs.map((run) => run.outcome)).toEqual(["constituted"]);
    expect(constituter.calls).toEqual([ENTITY_ID]);
  });

  it("un lot manuel sur la clôture tentée la couvre déjà", async () => {
    const constituter = new ScriptedConstituter(new NothingToCollectError(0));
    const { handler, coverage } = seeded(constituter);
    coverage.lastLiveBatchClosesAt = CLOSE;

    expect((await handler.execute()).runs.map((run) => run.outcome)).toEqual([
      "nothing_to_collect",
    ]);
  });

  it("aucune tentative passée : rien n'est manqué, le premier lot se tente", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, coverage } = autopilot(constituter, AFTER_PLANNED);
    coverage.floorAt = FLOOR;

    expect((await handler.execute()).runs.map((run) => run.outcome)).toEqual(["constituted"]);
  });
});
