import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { NOTHING_PENDING, ProductionDay } from "../production-day.js";
import { UNCHANGED_DAY, WHOLE_DAY } from "../production-day.changes.js";

/**
 * Ce que la journée dit avoir changé depuis sa lecture — l'adaptateur n'écrit
 * que ça (écriture par différence, 2026-11-02). Dates recopiées et comparées
 * entre elles seulement — exception étroite du §5.
 */

const EVENING = new Date("2026-09-07T18:00:00.000Z");
const MORNING = new Date("2026-09-08T07:30:00.000Z");
const NONE = new Set<string>();
const IDLE = { packingStarted: false, dispatchStarted: false };

function order(orderId: string, quantity = 4): ProducibleOrder {
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

function resupply(resupplyId: string): PlacedResupply {
  return {
    resupplyId,
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    servedByTransfer: true,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" }],
  };
}

/** Une journée arrêtée, telle que l'adaptateur la relit : rien n'a changé. */
function reloadedClosed(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of("2026-09-08"));
  day.close([order("ord_1")], NONE, EVENING, null, [resupply("rs_evening")]);
  return ProductionDay.restore(day.toSnapshot());
}

describe("ProductionDay.changes — ce que save écrira", () => {
  it("une journée relue en base, ou jamais écrite, n'a rien changé", () => {
    expect(reloadedClosed().changes).toEqual(UNCHANGED_DAY);
    expect(ProductionDay.open(ServiceDay.of("2026-09-08")).changes).toEqual(UNCHANGED_DAY);
  });

  it("une journée de base inconnue (fromSnapshot) s'écrit en entier", () => {
    const day = ProductionDay.fromSnapshot(reloadedClosed().toSnapshot());

    expect(day.changes).toEqual(WHOLE_DAY);
  });

  it("l'arrêt remplace le plan du soir et le compte", () => {
    const day = ProductionDay.open(ServiceDay.of("2026-09-08"));

    day.close([order("ord_1")], NONE, EVENING, null);

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, plan: true, counts: true });
  });

  it("le retirage n'ajoute que les commandes arrivées", () => {
    const day = reloadedClosed();

    day.retake([order("ord_1"), order("ord_2")], NONE, MORNING, "s_max", null);

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, addedOrders: ["ord_2"], counts: true });
  });

  it("un retirage sans arrivée ne change rien", () => {
    const day = reloadedClosed();

    day.retake([order("ord_1")], NONE, MORNING, "s_max", null);

    expect(day.changes).toEqual(UNCHANGED_DAY);
  });

  it("un lancement « au plus tôt » n'écrit que ce réassort et le compte", () => {
    const day = reloadedClosed();

    day.launchResupply(
      resupply("rs_asap"),
      { at: MORNING, staffUserId: "s_max", name: null },
      NOTHING_PENDING,
    );

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, launched: ["rs_asap"], counts: true });
  });

  it("une révision n'écrit que la commande révisée et le compte", () => {
    const day = reloadedClosed();

    day.reviseOrder("ord_1", [{ sku: "VIE-001", quantity: 9 }]);

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, revisedOrders: ["ord_1"], counts: true });
  });

  it("la réouverture remplace le plan du soir et le compte", () => {
    const day = reloadedClosed();

    day.reopen(IDLE, MORNING, "s_max");

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, plan: true, counts: true });
  });
});
