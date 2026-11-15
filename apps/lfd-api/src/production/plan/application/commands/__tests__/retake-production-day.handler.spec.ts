import { ProductionDay } from "../../../../day/domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../../../day/index.js";
import { ServiceDay } from "../../../../day/index.js";
import { InMemoryWithdrawals } from "../../../../day/application/__tests__/withdrawal-doubles.js";
import { RetakeProductionDayCommand } from "../retake-production-day.command.js";
import { closedDay, DAY, NOW, order, retakeScene, TIRAGE } from "./retake-production-day.scene.js";

/**
 * Le retirage : ce qu'il absorbe, sous quel verrou, et ce qu'il n'écrit pas.
 * Les faits qu'il publie ont leur spec (`.facts`).
 */
describe("reprendre le tirage d'une journée arrêtée", () => {
  it("absorbe ce qui est arrivé depuis, écrit la journée et date le retirage", async () => {
    const { handler, days, events } = retakeScene(closedDay(), [
      order("ord_1", 30),
      order("ord_2", 12),
    ]);

    const retake = await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(retake).toEqual({ date: DAY, absorbed: 1, retakenAt: NOW.toISOString() });
    expect(days.saved?.counts[0]?.quantity).toBe(42);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_day.retaken",
        subjectType: "production_day",
        subjectId: DAY,
        payload: { subjectLabel: DAY, serviceDay: DAY, absorbed: 1 },
      },
    ]);
  });

  it("n'absorbe pas une commande retirée par l'annulation staff (C3.4)", async () => {
    const withdrawals = new InMemoryWithdrawals();
    withdrawals.rows.set("ord_2", { day: DAY, at: NOW, afterInscription: false });
    const { handler, days } = retakeScene(closedDay(), [order("ord_1", 30), order("ord_2", 6)], {
      withdrawals,
    });

    const retake = await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(retake.absorbed).toBe(0);
    expect(days.saved).toBeNull();
  });

  it("ne publie rien au commerce : le seul envoi en mémoire est le fait journalisé", async () => {
    const { handler, events } = retakeScene(closedDay(), [order("ord_1", 30), order("ord_2", 12)]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(events.published).toEqual(events.traced);
  });

  /**
   * Régression : les commandes étaient lues AVANT le verrou, et une commande
   * admise entre la lecture et le verrou manquait au tirage (2026-11-02).
   */
  it("lit les commandes du commerce sous le verrou de la journée", async () => {
    const { handler, trace } = retakeScene(closedDay(), [order("ord_1", 30), order("ord_2", 12)]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(trace).toEqual([`lock:${DAY}`, "load", "producibleFor", "save"]);
  });

  it("le compte refait ne porte que la quantité : « sorti » vit dans les fournées", async () => {
    const { handler, days, trace } = retakeScene(closedDay(), [
      order("ord_1", 30),
      order("ord_2", 12),
    ]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(trace).toEqual([`lock:${DAY}`, "load", "producibleFor", "save"]);
    expect(days.saved?.counts[0]).toEqual({
      sku: "PAI-SEI",
      productName: "Pain de seigle",
      quantity: 42,
      saleUnit: "piece",
    });
  });

  it("n'écrit rien quand rien n'est arrivé, et rend le tirage affiché", async () => {
    // `absorbed: 0` est une information, pas une erreur — deux personnes qui
    // pressent le même bouton, ou un écran ouvert depuis un moment.
    const { handler, days, events } = retakeScene(closedDay(), [order("ord_1", 30)]);

    const retake = await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(retake).toEqual({ date: DAY, absorbed: 0, retakenAt: TIRAGE.toISOString() });
    expect(days.saved).toBeNull();
    expect(events.published).toEqual([]);
  });

  it("refuse une journée qui n'est pas arrêtée : il n'y a pas de tirage à reprendre", async () => {
    const { handler, days } = retakeScene(ProductionDay.open(ServiceDay.of(DAY)), [
      order("ord_1", 30),
    ]);

    await expect(
      handler.execute(new RetakeProductionDayCommand(DAY, "staff-1")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);
    expect(days.saved).toBeNull();
  });
});
