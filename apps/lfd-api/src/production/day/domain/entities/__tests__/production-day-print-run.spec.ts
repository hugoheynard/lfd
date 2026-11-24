import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../../channels/commerce/day-resupplies.reader.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";

/** Dates comparées entre elles seulement — exception étroite du §5. */

const EVENING = new Date("2026-09-07T18:00:00.000Z");
const MORNING = new Date("2026-09-08T07:30:00.000Z");
const NONE = new Set<string>();
const IDLE = { packingStarted: false, dispatchStarted: false };

function order(orderId: string, quantity = 4): ProducibleOrder {
  return producibleOrder(orderId, {
    reference: `REF-${orderId}`,
    customerLabel: "Hôtel des Trois Ponts",
    lines: [orderLine("VIE-001", quantity, "Croissant")],
  });
}

function resupply(resupplyId: string): PlacedResupply {
  return {
    resupplyId,
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    servedByTransfer: true,
    arrivalBy: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" }],
  };
}

/** Une journée arrêtée, telle que l'adaptateur la relit : rien n'a changé. */

function closed(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of("2026-09-08"));
  day.close([order("ord_1")], NONE, EVENING, null, [resupply("rs_evening")]);
  return ProductionDay.restore(day.toSnapshot());
}

/** Le tirage du dossier : 1 à l'arrêt, plus un par retirage (Hugo, 2026-11-18). */
describe("ProductionDay.printRun — le tirage du dossier", () => {
  it("vaut 1 à l'arrêt", () => {
    expect(closed().printRun).toBe(1);
  });

  it("monte d'un à chaque retirage qui absorbe, et se relit tel quel", () => {
    const day = closed();
    day.retake([order("ord_1"), order("ord_2")], NONE, MORNING, "s_max", null);
    day.retake([order("ord_1"), order("ord_2"), order("ord_3")], NONE, MORNING, "s_max", null);

    expect(day.printRun).toBe(3);
    expect(ProductionDay.restore(day.toSnapshot()).printRun).toBe(3);
  });

  it("un retirage sans arrivée ne change pas le tirage", () => {
    const day = closed();
    day.retake([order("ord_1")], NONE, MORNING, "s_max", null);

    expect(day.printRun).toBe(1);
  });

  it("la réouverture remet le tirage à 1 pour le prochain arrêt", () => {
    const day = closed();
    day.retake([order("ord_1"), order("ord_2")], NONE, MORNING, "s_max", null);
    day.reopen(IDLE, MORNING, "s_max");

    expect(day.printRun).toBe(1);
  });

  it("un instantané d'avant la colonne se relit au premier tirage", () => {
    const { retakeCount: _ignored, ...older } = closed().toSnapshot();

    expect(ProductionDay.restore(older).printRun).toBe(1);
  });
});
