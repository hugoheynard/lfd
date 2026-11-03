import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../../domain/errors/production-errors.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
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

  it("matérialise la coche héritée avant d'absorber, et ne la recopie plus", async () => {
    // Plan des fournées, §5.3–5.4 : 30 cochés puis 30 → 42 ne doivent pas se
    // lire 42 sortis. La coche devient une fournée de 30 (même id que le
    // rattrapage), écrite avant la journée ; le compte recréé naît sans coche.
    const { handler, days, batches, trace } = retakeScene(closedDay("MB"), [
      order("ord_1", 30),
      order("ord_2", 12),
    ]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    const inherited = `backfill-${DAY}-PAI-SEI`;
    expect(trace).toEqual([`lock:${DAY}`, "load", "producibleFor", `record:${inherited}`, "save"]);
    expect(batches.batches).toEqual([
      {
        id: inherited,
        sku: "PAI-SEI",
        quantity: 30,
        recorded: { at: TIRAGE, by: "staff-1", initials: "MB" },
        cancelled: null,
        returned: 0,
        pendingReturn: 0,
      },
    ]);
    expect(days.saved?.counts[0]).toMatchObject({ quantity: 42, done: null });
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
