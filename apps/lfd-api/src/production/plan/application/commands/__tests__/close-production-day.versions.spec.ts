import { CloseProductionDayCommand } from "../close-production-day.command.js";
import { closeScene, closedDay, DAY, openDay, order } from "./close-production-day.scene.js";

/**
 * L'arrêt garde la version de son plan
 * (`documentation/fournil/les-versions-du-plan.md`) :
 * l'arrêt manuel signé du staff, l'automatique du système ; la réannonce
 * n'en garde pas — le plan ne change pas.
 */
describe("clore une journée — la version du plan", () => {
  it("l'arrêt manuel demande une version `closed`, signée du staff et de son nom", async () => {
    const { handler, versions } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    expect(versions.requested).toEqual([
      { cause: "closed", by: { kind: "staff", staffId: "staff-1", name: "Marie Dupont" } },
    ]);
  });

  it("l'arrêt automatique demande une version `auto_closed`, signée du système", async () => {
    const { handler, versions } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY, "automatic"));

    expect(versions.requested).toEqual([{ cause: "auto_closed", by: { kind: "system" } }]);
  });

  it("la réannonce d'une journée déjà arrêtée ne demande aucune version", async () => {
    const { handler, versions } = closeScene(closedDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    expect(versions.requested).toEqual([]);
  });
});
