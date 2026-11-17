import {
  nextIntent,
  problemScene,
  SCENE_COUNT,
  SCENE_DAY,
  SCENE_SKU,
} from "../../__tests__/problem-scene.js";
import { MarkLineDoneCommand } from "../mark-line-done.command.js";
import { RecordBatchCommand } from "../record-batch.command.js";
import { ReportProblemCommand } from "../report-problem.command.js";

/** **« Fait »** (`fournil/les-niveaux-de-suivi.md`), ports doublés. */
function done(key = nextIntent()) {
  return new MarkLineDoneCommand(SCENE_DAY, SCENE_SKU, "staff-1", key);
}

describe("MarkLineDoneHandler", () => {
  it("déclare une fournée du reste à sortir, remise au colisage, et fige la journée", async () => {
    const scene = problemScene();
    await scene.record.execute(new RecordBatchCommand(SCENE_DAY, SCENE_SKU, "b1", 10, "", "s"));

    await scene.done.execute(done());

    const declared = scene.store.batches.find((batch) => batch.id.startsWith("done-"));
    expect(declared).toMatchObject({ quantity: SCENE_COUNT - 10, recorded: { by: "staff-1" } });
    expect(scene.ledger.handoffs.map((handoff) => handoff.id)).toContain(declared?.id);
    expect(scene.frozen.rows.has(SCENE_DAY)).toBe(true);
    expect((await scene.days.load()).producedOf(SCENE_SKU)).toBe(SCENE_COUNT);
  });

  it("une ligne déjà faite ne déclare rien", async () => {
    const scene = problemScene();
    await scene.done.execute(done());

    await scene.done.execute(done());

    expect(scene.store.batches).toHaveLength(1);
  });

  it("le plafond d'un rouge borne le reste", async () => {
    const scene = problemScene();
    await scene.record.execute(new RecordBatchCommand(SCENE_DAY, SCENE_SKU, "b1", 10, "", "s"));
    await scene.report.execute(
      new ReportProblemCommand(SCENE_DAY, SCENE_SKU, 13, null, "staff-1", nextIntent()),
    );

    await scene.done.execute(done());

    expect((await scene.days.load()).producedOf(SCENE_SKU)).toBe(13);
    expect(scene.store.batches.some((batch) => batch.id.startsWith("done-"))).toBe(false);
  });

  it("rejoué avec la même clé, ne déclare qu'une fois", async () => {
    const scene = problemScene();
    const key = nextIntent();

    await scene.done.execute(done(key));
    await scene.done.execute(done(key));

    expect(scene.store.writes).toHaveLength(1);
  });
});
