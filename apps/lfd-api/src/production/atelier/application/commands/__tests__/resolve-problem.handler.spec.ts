import { ProductionProblemNotFoundError } from "../../../domain/errors/problem-errors.js";
import {
  nextIntent,
  problemScene,
  SCENE_DAY,
  SCENE_NOW,
  SCENE_SKU,
} from "../../__tests__/problem-scene.js";
import { RecordBatchCommand } from "../record-batch.command.js";
import { ReportProblemCommand } from "../report-problem.command.js";
import { ResolveProblemCommand } from "../resolve-problem.command.js";

/** **« Marquer traité »** (`fournil/les-niveaux-de-suivi.md`), ports doublés. */
async function reported() {
  const scene = problemScene();
  await scene.record.execute(new RecordBatchCommand(SCENE_DAY, SCENE_SKU, "b1", 80, "", "s"));
  await scene.report.execute(
    new ReportProblemCommand(SCENE_DAY, SCENE_SKU, 60, null, "staff-1", nextIntent()),
  );
  return scene;
}

describe("ResolveProblemHandler", () => {
  it("pose l'instant et l'auteur, journalise, et garde le plafond", async () => {
    const scene = await reported();

    await scene.resolve.execute(new ResolveProblemCommand("pb_000001", "staff-1", nextIntent()));

    expect(scene.problems.of(SCENE_DAY, SCENE_SKU)).toMatchObject({
      produced: 60,
      resolved: { at: SCENE_NOW, staffId: "staff-1", name: "Marie Dupont" },
    });
    expect(scene.events.factTypes()).toEqual([
      "production_problem.reported",
      "production_problem.resolved",
    ]);
  });

  it("déjà traité : rien n'est écrit ni journalisé", async () => {
    const scene = await reported();
    await scene.resolve.execute(new ResolveProblemCommand("pb_000001", "staff-1", nextIntent()));
    const saves = scene.problems.saves;

    await scene.resolve.execute(new ResolveProblemCommand("pb_000001", "chef", nextIntent()));

    expect(scene.problems.saves).toBe(saves);
    expect(scene.events.traced).toHaveLength(2);
  });

  it("refuse un problème inconnu", async () => {
    const scene = problemScene();

    await expect(
      scene.resolve.execute(new ResolveProblemCommand("pb_inconnu", "staff-1", nextIntent())),
    ).rejects.toBeInstanceOf(ProductionProblemNotFoundError);
  });
});
