import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
import { UNCHANGED_DAY } from "../production-day.changes.js";
import { DayPlan, withoutWithdrawn } from "../production-day.plan.js";

/**
 * Le plan d'une journée, sorti de l'agrégat le 2026-11-02 : immuable, il rend
 * un plan neuf à chaque geste. Le comportement de bout en bout reste éprouvé
 * à travers `ProductionDay` (production-day*.spec.ts) ; ici, ce que la sortie
 * ajoute — l'immuabilité et la règle du compte, une fois.
 */

const LAUNCHED_AT = new Date("2026-09-08T07:30:00.000Z");

function order(orderId: string, quantity: number): ProducibleOrder {
  return {
    orderId,
    reference: `REF-${orderId}`,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [
      { sku: "VIE-001", productName: "Croissant", quantity, saleUnit: "piece", madeToOrder: null },
    ],
  };
}

function resupply(resupplyId: string, quantity: number): PlacedResupply {
  return {
    resupplyId,
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    servedByTransfer: true,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity, saleUnit: "piece" }],
  };
}

function quantity(plan: DayPlan): number | undefined {
  return plan.counts.find((count) => count.sku === "VIE-001")?.quantity;
}

describe("DayPlan", () => {
  it("un geste rend un plan neuf et laisse l'ancien intact", () => {
    const empty = DayPlan.of(DayPlan.EMPTY);

    const frozen = empty.frozen([order("ord_1", 4)], [resupply("rs_1", 6)]);

    expect(empty.orders).toEqual([]);
    expect(empty.changes).toEqual(UNCHANGED_DAY);
    expect(quantity(frozen)).toBe(10);
  });

  it("refait le compte sans jamais descendre sous ce qui a été demandé au four", () => {
    const frozen = DayPlan.of(DayPlan.EMPTY).frozen([order("ord_1", 10)], []);

    const { plan } = frozen.revised("2026-09-08", "ord_1", [{ sku: "VIE-001", quantity: 3 }]);

    expect(plan.orders[0]?.lines[0]?.quantity).toBe(3);
    expect(quantity(plan)).toBe(10);
  });

  it("la réouverture efface le plan du soir mais garde les lancés", () => {
    const launched = { ...resupply("rs_asap", 5), launched: { at: LAUNCHED_AT, by: "s_max" } };
    const plan = DayPlan.of(DayPlan.EMPTY)
      .frozen([order("ord_1", 4)], [resupply("rs_1", 6)])
      .withLaunched(launched)
      .cleared();

    expect(plan.orders).toEqual([]);
    expect(plan.resupplies).toEqual([]);
    expect(plan.counts).toEqual([]);
    expect(plan.launched.map((r) => r.resupplyId)).toEqual(["rs_asap"]);
    expect(plan.isEmptyWith([], [])).toBe(false);
  });

  it("un retirage sans arrivée rend le même plan, sans changement", () => {
    const frozen = DayPlan.of(DayPlan.EMPTY).frozen([order("ord_1", 4)], []);

    const { plan, count } = frozen.absorbed([order("ord_1", 4)]);

    expect(count).toBe(0);
    expect(plan).toBe(frozen);
  });

  it("écarte les commandes retirées par l'équipe", () => {
    const kept = withoutWithdrawn([order("ord_1", 1), order("ord_2", 1)], new Set(["ord_1"]));

    expect(kept.map((o) => o.orderId)).toEqual(["ord_2"]);
  });
});
