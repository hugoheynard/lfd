import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
import { ProductionDayEmptyError } from "../../errors/production-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";

/**
 * Le réassort au plan figé (lot R3a, `reassort-boutiques/plan-reapprovisionnement.md`
 * §13) : l'agrégat fige les réassorts à part des commandes, et les compte au
 * total. Dates comparées entre elles seulement.
 */

const AT = new Date("2026-09-07T18:00:00.000Z");
const LATER = new Date("2026-09-08T05:30:00.000Z");
const NO_WITHDRAWAL = new Set<string>();

function order(orderId = "ord_1", quantity = 40): ProducibleOrder {
  return {
    orderId,
    reference: "ORD-0001",
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity, saleUnit: "piece" }],
  };
}

const RESUPPLY: PlacedResupply = {
  resupplyId: "rs_1",
  siteId: "site_village",
  siteLabel: "Le Village",
  name: null,
  servedByTransfer: true,
  lines: [
    { sku: "VIE-001", productName: "Croissant", quantity: 12 },
    { sku: "PAIN-001", productName: "Baguette", quantity: 5 },
  ],
};

/** Un réassort tel que la journée le fige : à la pièce (plan `pricing/vente-au-poids.md`, § 2). */
function frozen<T extends { readonly lines: readonly object[] }>(resupply: T): T {
  return { ...resupply, lines: resupply.lines.map((line) => ({ ...line, saleUnit: "piece" })) };
}

function opened(): ProductionDay {
  return ProductionDay.open(ServiceDay.of("2026-09-08"));
}

function quantities(day: ProductionDay): readonly (readonly [string, number])[] {
  return day.counts.map((count) => [count.sku, count.quantity] as const);
}

describe("ProductionDay — le réassort figé à l'arrêt (R3a)", () => {
  it("fige les réassorts à part, et compte commandes + réassorts (décision B)", () => {
    const day = opened();

    day.close([order()], NO_WITHDRAWAL, AT, null, [RESUPPLY]);

    expect(day.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
    expect(day.resupplies).toEqual([frozen(RESUPPLY)]);
    expect(quantities(day)).toEqual([
      ["PAIN-001", 5],
      ["VIE-001", 52],
    ]);
  });

  it("recopie le réassort : le muter ensuite ne touche pas la journée", () => {
    const lines = [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }];
    const day = opened();

    day.close([], NO_WITHDRAWAL, AT, null, [{ ...RESUPPLY, lines }]);
    lines.push({ sku: "X", productName: "Intrus", quantity: 1 });

    expect(day.resupplies[0]?.lines).toHaveLength(1);
  });

  it("une journée de réassorts seuls n'est pas vide", () => {
    const day = opened();

    day.close([], NO_WITHDRAWAL, AT, null, [RESUPPLY]);

    expect(day.isClosed).toBe(true);
    expect(day.orders).toEqual([]);
  });

  it("vide = ni commande ni réassort : refusée", () => {
    expect(() => opened().close([], NO_WITHDRAWAL, AT, null, [])).toThrow(ProductionDayEmptyError);
    expect(() => opened().close([], NO_WITHDRAWAL, AT, null, [])).toThrow(/ni aucun réassort/u);
  });

  it("le retirage garde les réassorts au compte refait", () => {
    const day = opened();
    day.close([order()], NO_WITHDRAWAL, AT, null, [RESUPPLY]);

    const absorbed = day.retake([order(), order("ord_2", 10)], NO_WITHDRAWAL, LATER, "s1", null);

    expect(absorbed).toBe(1);
    expect(day.resupplies).toEqual([frozen(RESUPPLY)]);
    expect(quantities(day)).toEqual([
      ["PAIN-001", 5],
      ["VIE-001", 62],
    ]);
  });

  it("la réouverture dégèle les réassorts, comme les commandes", () => {
    const day = opened();
    day.close([order()], NO_WITHDRAWAL, AT, null, [RESUPPLY]);

    day.reopen({ packingStarted: false, dispatchStarted: false }, LATER, "s1");

    expect(day.resupplies).toEqual([]);
    expect(day.counts).toEqual([]);
    expect(day.toSnapshot().resupplies).toEqual([]);
  });

  it("va et revient par l'instantané ; un instantané d'avant le lot se relit sans réassort", () => {
    const day = opened();
    day.close([order()], NO_WITHDRAWAL, AT, null, [RESUPPLY]);

    const again = ProductionDay.fromSnapshot(day.toSnapshot());
    const { resupplies: _dropped, ...before } = day.toSnapshot();

    expect(again.resupplies).toEqual([frozen(RESUPPLY)]);
    expect(ProductionDay.fromSnapshot(before).resupplies).toEqual([]);
  });
});
