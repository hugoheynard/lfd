import { ProductionDayClosedEvent } from "../../../channels/commerce/production-day-closed.event.js";
import {
  PRODUCTION_RESUPPLY_LIST_DRAWN,
  ResupplyListDrawnEvent,
} from "../../../channels/packing/resupply-list-drawn.event.js";
import { ProductionDayClosedJournalEvent } from "../../../domain/events/production-day.events.js";
import { CutoffRules, DayResupplies, ResupplyTime } from "../../__tests__/settings-doubles.js";
import { CloseProductionDayCommand } from "../close-production-day.command.js";
import {
  closeScene,
  DAY,
  LABO_RESUPPLY,
  NOW,
  openDay,
  order,
  VILLAGE_RESUPPLY,
} from "./close-production-day.scene.js";

describe("le réassort au plan figé (lot R3a)", () => {
  const open = openDay;

  it("fige les réassorts à part des commandes, et les compte au TOTAL (décision B)", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, days } = closeScene(open(), [order()], { resupplies });

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(days.saved?.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
    // Un réassort figé est à la pièce (plan `pricing/vente-au-poids.md`, § 2).
    expect(days.saved?.resupplies).toEqual([
      {
        ...VILLAGE_RESUPPLY,
        lines: VILLAGE_RESUPPLY.lines.map((line) => ({ ...line, saleUnit: "piece" as const })),
      },
    ]);
    expect(days.saved?.counts).toEqual([
      { sku: "PAIN-001", productName: "Baguette", quantity: 5, saleUnit: "piece", done: null },
      { sku: "VIE-001", productName: "Croissant", quantity: 52, saleUnit: "piece", done: null },
    ]);
  });

  it("le fait porte les réassorts figés, le journal compte toujours les seules commandes", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, events, durable } = closeScene(open(), [order()], { resupplies });

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.absorbed).toBe(1);
    expect(events.published).toEqual([new ProductionDayClosedJournalEvent(DAY, 1)]);
    expect(durable.facts[0]).toEqual(
      new ProductionDayClosedEvent(DAY, NOW, ["ord_1"], null, ["rs_1"]).durableFact(),
    );
  });

  it("une journée de réassorts seuls n'est pas vide : elle s'arrête", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, days } = closeScene(open(), [], { resupplies });

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.alreadyClosed).toBe(false);
    expect(days.saved?.orders).toEqual([]);
    expect(days.saved?.counts.map((count) => count.quantity)).toEqual([5, 12]);
  });

  it("refuse l'arrêt à la main avant l'heure du réassort, plus tardive que l'heure générale", async () => {
    // NOW = 20:00 à Paris la veille ; générale 19:00 + 30 min, réassort 20:30.
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:00", graceMinutes: 30 }]);
    const { handler, days } = closeScene(open(), [order()], {
      cutoffs,
      resupplyTime: new ResupplyTime("20:30"),
    });

    const refusal = handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    await expect(refusal).rejects.toThrow("le lundi 7 septembre à 20:30");
    expect(days.saved).toBeNull();
  });

  /** Lot R3b (§13.4 point 3) : le refus nommait l'heure générale même quand le réassort fixait l'arrêt. */
  it("le refus nomme l'heure du réassort quand c'est elle qui fixe l'arrêt", async () => {
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:00", graceMinutes: 30 }]);
    const { handler } = closeScene(open(), [order()], {
      cutoffs,
      resupplyTime: new ResupplyTime("20:30"),
    });

    const refusal = handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    await expect(refusal).rejects.toThrow("s'arrête tout seul à l'heure du réassort");
    await expect(refusal).rejects.toThrow("avancez l'heure du réassort");
  });
});

describe("le réassort à coliser (lot R3b)", () => {
  const open = openDay;
  const typesOf = (facts: readonly { readonly type: string }[]) => facts.map((fact) => fact.type);

  it("publie un fait par réassort d'un point servi par transfert, aucun pour le Labo", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY, LABO_RESUPPLY]);
    const { handler, durable } = closeScene(open(), [order()], { resupplies });

    await handler.execute(new CloseProductionDayCommand(DAY));

    const drawn = durable.facts.filter((fact) => fact.type === PRODUCTION_RESUPPLY_LIST_DRAWN);
    expect(drawn).toEqual([
      new ResupplyListDrawnEvent(DAY, NOW, {
        resupplyId: "rs_1",
        siteId: "site_village",
        siteLabel: "Le Village",
        name: null,
        lines: VILLAGE_RESUPPLY.lines,
      }).durableFact(),
    ]);
    expect(drawn[0]?.key).toBe(`${PRODUCTION_RESUPPLY_LIST_DRAWN}:${DAY}:rs_1`);
    expect(typesOf(durable.facts)).toContain("production.packing_list_drawn");
  });

  it("la réannonce republie la même clé", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, durable } = closeScene(open(), [order()], { resupplies });
    await handler.execute(new CloseProductionDayCommand(DAY));
    const first = durable.facts.find((fact) => fact.type === PRODUCTION_RESUPPLY_LIST_DRAWN);

    await handler.execute(new CloseProductionDayCommand(DAY));

    const keys = durable.facts
      .filter((fact) => fact.type === PRODUCTION_RESUPPLY_LIST_DRAWN)
      .map((fact) => fact.key);
    expect(keys).toEqual([first?.key, first?.key]);
  });

  it("après une réouverture, la clé porte le suffixe de la réouverture", () => {
    const reopenedAt = new Date(NOW.getTime() - 60_000);
    const fact = new ResupplyListDrawnEvent(
      DAY,
      NOW,
      { resupplyId: "rs_1", siteId: "site_village", siteLabel: null, name: null, lines: [] },
      reopenedAt,
    ).durableFact();

    expect(fact.key).toBe(
      `${PRODUCTION_RESUPPLY_LIST_DRAWN}:${DAY}:rs_1:after-reopening:${reopenedAt.toISOString()}`,
    );
  });
});
