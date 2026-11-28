import { RetakeProductionDayCommand } from "../retake-production-day.command.js";
import { closedDay, DAY, order, retakeScene } from "./retake-production-day.scene.js";

/**
 * Le retirage garde la version de son plan
 * (`documentation/fournil/les-versions-du-plan.md`) ; un
 * retirage sans arrivée ne change rien et n'en garde pas.
 */
describe("reprendre le tirage — la version du plan", () => {
  it("un retirage qui absorbe demande une version `retaken`, signée de qui l'a fait", async () => {
    const { handler, versions } = retakeScene(closedDay(), [
      order("ord_1", 30),
      order("ord_2", 12),
    ]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(versions.requested).toEqual([
      { cause: "retaken", by: { kind: "staff", staffId: "staff-1", name: "Marie Dupont" } },
    ]);
  });

  it("un retirage sans arrivée ne demande aucune version", async () => {
    const { handler, versions } = retakeScene(closedDay(), [order("ord_1", 30)]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(versions.requested).toEqual([]);
  });
});
