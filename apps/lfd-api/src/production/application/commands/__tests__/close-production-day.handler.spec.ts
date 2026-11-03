import { ProductionDayClosedJournalEvent } from "../../../domain/events/production-day.events.js";
import { ProductionDayEmptyError } from "../../../domain/errors/production-errors.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
import { CloseProductionDayCommand } from "../close-production-day.command.js";
import {
  closedFact,
  closeScene,
  DAY,
  listFact,
  NOW,
  openDay,
  order,
} from "./close-production-day.scene.js";

/**
 * L'arrêt d'une journée ouverte : ce qu'il fige, publie et journalise. Les
 * autres sujets de la clôture ont leur spec — l'heure limite (`.cutoff`), la
 * réannonce (`.reannounce`), le réassort (`.resupply`), le verrou (`.lock`).
 */

describe("clore une journée", () => {
  it("inscrit les commandes, arrête le compte, et PUBLIE le fait", async () => {
    const open = openDay();
    const { handler, days, events, durable } = closeScene(open, [
      order(),
      order({ orderId: "ord_2" }),
    ]);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure).toEqual({
      date: DAY,
      absorbed: 2,
      alreadyClosed: false,
      closedAt: NOW.toISOString(),
    });
    expect(days.saved?.counts).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 80, saleUnit: "piece", done: null },
    ]);
    expect(events.published).toEqual([new ProductionDayClosedJournalEvent(DAY, 2)]);
    // Puis la liste à coliser, une commande par fait (colisage, K1, §11 B1).
    expect(durable.facts).toEqual([
      closedFact(["ord_1", "ord_2"], NOW),
      listFact(order(), NOW),
      listFact(order({ orderId: "ord_2" }), NOW),
    ]);
  });

  it("écarte une commande retirée par l'annulation staff, lue sous le verrou (C3.4)", async () => {
    const withdrawals = new InMemoryWithdrawals();
    withdrawals.rows.set("ord_2", { day: DAY, at: NOW, afterInscription: false });
    const { handler, days, durable } = closeScene(
      openDay(),
      [order(), order({ orderId: "ord_2" })],
      { withdrawals },
    );

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.absorbed).toBe(1);
    expect(days.saved?.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
    expect(durable.facts[0]).toEqual(closedFact(["ord_1"], NOW));
  });

  it("la liste à coliser porte l'ÉCHÉANCE de chaque commande (colisage, §13)", async () => {
    const { handler, durable } = closeScene(openDay(), [order({ dueAt: "07:30" })]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(durable.facts[1]).toMatchObject({
      type: "production.packing_list_drawn",
      key: `production.packing_list_drawn:${DAY}:ord_1`,
      payload: { order: { dueAt: "07:30" } },
    });
  });

  it("dit au journal un arrêt AUTOMATIQUE — `automatic: true` (lot A2, S7)", async () => {
    const { handler, events } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY, "automatic"));

    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { subjectLabel: DAY, serviceDay: DAY, absorbed: 1, automatic: true },
    ]);
  });

  it("FIGE qui a arrêté, nom compris, à l'arrêt manuel", async () => {
    const { handler, days } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    expect(days.saved?.closedBy).toEqual({
      kind: "staff",
      staffUserId: "staff-1",
      name: "Marie Dupont",
    });
  });

  it("FIGE « automatiquement » à l'arrêt automatique, et rien quand l'auteur est inconnu", async () => {
    const auto = closeScene(openDay(), [order()]);
    await auto.handler.execute(new CloseProductionDayCommand(DAY, "automatic"));
    expect(auto.days.saved?.closedBy).toEqual({ kind: "automatic" });

    const anonymous = closeScene(openDay(), [order()]);
    await anonymous.handler.execute(new CloseProductionDayCommand(DAY));
    expect(anonymous.days.saved?.closedBy).toBeNull();
  });

  it("JOURNALISE la clôture — la date de service et le nombre inscrit", async () => {
    const { handler, events } = closeScene(openDay(), [order(), order({ orderId: "ord_2" })]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_day.closed",
        subjectType: "production_day",
        subjectId: DAY,
        payload: { subjectLabel: DAY, serviceDay: DAY, absorbed: 2 },
      },
    ]);
  });

  it("journal ET boîte d'envoi partent DANS l'unité de travail de la clôture", async () => {
    // Le fait durable tombe avec la clôture, ou n'existe pas : le double refuse
    // hors unité de travail, comme le vrai port. Plus rien ne part en mémoire.
    const { handler, events, durable } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.insideUnitOfWork).toEqual([new ProductionDayClosedJournalEvent(DAY, 1)]);
    // La clôture et la liste à coliser : le double refuse hors unité de travail.
    expect(durable.facts).toHaveLength(2);
  });

  it("la clé de la clôture est déterministe : la journée et l'instant d'arrêt", async () => {
    const { handler, durable } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(durable.facts[0]).toMatchObject({
      type: "production.day_closed",
      key: `production.day_closed:${DAY}:${NOW.toISOString()}`,
      payload: { serviceDay: DAY, closedAt: NOW.toISOString(), orderIds: ["ord_1"] },
    });
  });

  it("ne confirme RIEN chez le commerce — il l'apprend par l'événement", async () => {
    // `confirmed` reste un fait du commerce, tiré de l'événement par son
    // abonné. Le seul geste que la clôture DEMANDE au commerce est le
    // balayage des règlements en vol, par le port que le fournil déclare
    // (plan d'abandon, B1, 2026-09-26) — et c'est le commerce qui l'écrit.
    const { handler, commerce } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(commerce.asked).toBe(1);
  });

  it("BALAIE les règlements en vol AVANT de compter (Q1)", async () => {
    // Compter d'abord laisserait une journée sans carte payée vide, donc
    // inarrêtable, et ses règlements en vol vivants pour toujours (§4).
    const { handler, sweeper, calls } = closeScene(openDay(), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(sweeper.days).toEqual([DAY]);
    expect(calls).toEqual(["sweep", "producibleFor"]);
  });

  it("refuse la journée vide APRÈS avoir balayé : personne n'a payé", async () => {
    const { handler, sweeper } = closeScene(openDay(), []);

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ProductionDayEmptyError,
    );
    expect(sweeper.days).toEqual([DAY]);
  });

  it("REFUSE une journée sans commande, plutôt que d'arrêter le vide", async () => {
    const { handler, days, events, durable } = closeScene(openDay(), []);

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ProductionDayEmptyError,
    );
    expect(days.saved).toBeNull();
    expect(events.published).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("refuse un jour qui n'est pas une date", async () => {
    const { handler } = closeScene(openDay(), [order()]);

    await expect(handler.execute(new CloseProductionDayCommand("08/09/2026"))).rejects.toThrow();
  });
});
