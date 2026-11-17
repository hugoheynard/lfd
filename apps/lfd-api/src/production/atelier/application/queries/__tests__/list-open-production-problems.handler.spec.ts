import { alwaysGreenScene, BAGUETTE } from "../../__tests__/always-green-scene.js";
import {
  nextIntent,
  SCENE_COUNT,
  SCENE_DAY,
  SCENE_NOW,
  SCENE_SKU,
} from "../../__tests__/problem-scene.js";
import { RecordBatchCommand } from "../../commands/record-batch.command.js";
import { ReportProblemCommand } from "../../commands/report-problem.command.js";
import { ResolveProblemCommand } from "../../commands/resolve-problem.command.js";
import { CancelBatchCommand } from "../../commands/cancel-batch.command.js";
import { ListOpenProductionProblemsHandler } from "../list-open-production-problems.handler.js";
import { ListOpenProductionProblemsQuery } from "../list-open-production-problems.query.js";

/** La Supervision des problèmes (plan `fournil/plan-niveaux-de-suivi.md`, § 3.8). */
describe("ListOpenProductionProblemsHandler", () => {
  it("sert le problème ouvert : nom, attendu, plafond, sorti, raison, depuis quand", async () => {
    const scene = alwaysGreenScene();
    await scene.record.execute(new RecordBatchCommand(SCENE_DAY, SCENE_SKU, "b1", 20, "", "s"));
    await scene.record.execute(new RecordBatchCommand(SCENE_DAY, SCENE_SKU, "b2", 30, "", "s"));
    await scene.cancel.execute(new CancelBatchCommand(SCENE_DAY, "b2", "s"));
    await scene.report.execute(
      new ReportProblemCommand(SCENE_DAY, SCENE_SKU, 0, "pâte ratée", "staff-1", nextIntent()),
    );
    const handler = new ListOpenProductionProblemsHandler(
      scene.problems.reader(),
      scene.days,
      scene.unconfirmed,
    );

    const view = await handler.execute(new ListOpenProductionProblemsQuery(SCENE_DAY));

    expect(view).toEqual({
      serviceDay: SCENE_DAY,
      problems: [
        {
          id: "pb_000001",
          sku: SCENE_SKU,
          productName: "Croissant",
          expected: SCENE_COUNT,
          produced: 0,
          // Le retour en attente n'a pas pu être corrigé : l'écart reste visible.
          output: 30,
          reason: "pâte ratée",
          reportedAt: SCENE_NOW.toISOString(),
          reportedByName: "Marie Dupont",
          version: 1,
        },
      ],
      // La baguette n'a pas de palier : à confirmer. Le croissant est sous son plafond.
      unconfirmed: [{ sku: BAGUETTE, productName: "Baguette", quantity: 2, output: 0 }],
    });
  });

  it("un problème traité n'est plus servi", async () => {
    const scene = alwaysGreenScene();
    await scene.report.execute(
      new ReportProblemCommand(SCENE_DAY, SCENE_SKU, 0, null, "staff-1", nextIntent()),
    );
    await scene.resolve.execute(new ResolveProblemCommand("pb_000001", "chef", nextIntent()));
    const handler = new ListOpenProductionProblemsHandler(
      scene.problems.reader(),
      scene.days,
      scene.unconfirmed,
    );

    const view = await handler.execute(new ListOpenProductionProblemsQuery(SCENE_DAY));

    expect(view.problems).toEqual([]);
  });

  it("une ligne à confirmer quitte la liste une fois sortie jusqu'à son compte", async () => {
    const scene = alwaysGreenScene();
    await scene.record.execute(new RecordBatchCommand(SCENE_DAY, BAGUETTE, "b1", 2, "", "s"));
    const handler = new ListOpenProductionProblemsHandler(
      scene.problems.reader(),
      scene.days,
      scene.unconfirmed,
    );

    const view = await handler.execute(new ListOpenProductionProblemsQuery(SCENE_DAY));

    expect(view.unconfirmed).toEqual([]);
  });

  it("des besoins illisibles mettent toutes les lignes en toujours vert à confirmer", async () => {
    const scene = alwaysGreenScene("down");
    const handler = new ListOpenProductionProblemsHandler(
      scene.problems.reader(),
      scene.days,
      scene.unconfirmed,
    );

    const view = await handler.execute(new ListOpenProductionProblemsQuery(SCENE_DAY));

    expect(view.unconfirmed.map((line) => line.sku).sort()).toEqual([BAGUETTE, SCENE_SKU].sort());
  });
});
