import { RetakeProductionDayCommand } from "../retake-production-day.command.js";
import { closedDay, DAY, NOW, order, retakeScene } from "./retake-production-day.scene.js";

/** Les faits durables que le retirage publie, dans son unité de travail. */
describe("la liste à coliser d'un retirage (colisage, K1, §11 B2)", () => {
  it("publie une commande à coliser pour chaque commande absorbée, et elles seules", async () => {
    const { handler, durable } = retakeScene(closedDay(), [
      order("ord_1", 30),
      order("ord_2", 12),
      order("ord_3", 4),
    ]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(
      durable.facts
        .filter((fact) => fact.type === "production.packing_list_drawn")
        .map((fact) => fact.key),
    ).toEqual([
      `production.packing_list_drawn:${DAY}:ord_2`,
      `production.packing_list_drawn:${DAY}:ord_3`,
    ]);
    // Datées du retirage — l'instant du tirage qui les a inscrites.
    expect(durable.facts[0]?.payload).toMatchObject({ drawnAt: NOW.toISOString() });
  });

  it("ne publie rien quand rien n'est absorbé", async () => {
    const { handler, durable } = retakeScene(closedDay(), [order("ord_1", 30)]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(durable.facts).toEqual([]);
  });
});

describe("le fait du retirage (dossier-prod-du-jour.md, E3)", () => {
  it("publie `production.day_retaken` une fois, daté du retirage, avec le nombre et la liste absorbés", async () => {
    const { handler, durable } = retakeScene(closedDay(), [
      order("ord_1", 30),
      order("ord_2", 12),
      order("ord_3", 4),
    ]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(durable.facts.filter((fact) => fact.type === "production.day_retaken")).toEqual([
      {
        type: "production.day_retaken",
        key: `production.day_retaken:${DAY}:${NOW.toISOString()}`,
        payload: {
          serviceDay: DAY,
          retakenAt: NOW.toISOString(),
          absorbed: 2,
          shipments: [
            { orderId: "ord_2", rank: 1 },
            { orderId: "ord_3", rank: 1 },
          ],
        },
      },
    ]);
  });
});
