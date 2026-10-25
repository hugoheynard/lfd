import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import {
  RevisedLinesMismatchError,
  RevisedOrderNotInPlanError,
} from "../../errors/order-revision-errors.js";
import { ProductionDayNotClosedError } from "../../errors/production-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";

/**
 * La révision d'une commande inscrite (plan A2, § 7, B3) : les lignes de la
 * commande disent le dû révisé, dans les deux sens ; le compte du jour ne
 * baisse jamais.
 */

/** Recopiés dans la journée, jamais comparés à l'horloge — exception étroite du §5. */
const AT = new Date("2026-10-25T18:00:00.000Z");
const LATER = new Date("2026-10-26T04:00:00.000Z");
const DAY = ServiceDay.of("2026-10-26");

function order(
  orderId: string,
  lines: readonly { sku: string; quantity: number }[],
): ProducibleOrder {
  return {
    orderId,
    reference: `ORD-${orderId}`,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines: lines.map((line) => ({ ...line, productName: `Article ${line.sku}` })),
  };
}

function closedWith(...orders: ProducibleOrder[]): ProductionDay {
  const day = ProductionDay.open(DAY);
  day.close(orders, new Set<string>(), AT, null);
  return day;
}

function countOfSku(day: ProductionDay, sku: string): number | undefined {
  return day.counts.find((item) => item.sku === sku)?.quantity;
}

describe("ProductionDay.reviseOrder — la hausse", () => {
  it("monte la ligne de la commande ET le compte du jour, et rend ce qui a monté", () => {
    const day = closedWith(
      order("a", [
        { sku: "BAG", quantity: 10 },
        { sku: "CRO", quantity: 5 },
      ]),
      order("b", [{ sku: "BAG", quantity: 4 }]),
    );

    const raised = day.reviseOrder("a", [
      { sku: "BAG", quantity: 12 },
      { sku: "CRO", quantity: 5 },
    ]);

    expect(raised).toEqual([{ sku: "BAG", productName: "Article BAG", from: 10, to: 12 }]);
    expect(day.orders.find((o) => o.orderId === "a")?.lines.map((l) => l.quantity)).toEqual([
      12, 5,
    ]);
    expect(countOfSku(day, "BAG")).toBe(16);
    expect(countOfSku(day, "CRO")).toBe(5);
  });
});

describe("ProductionDay.reviseOrder — la baisse", () => {
  /**
   * Régression gardée (plan A2, § 7, B3) : une baisse après l'arrêt ne fait
   * pas baisser le compte du four — ce qui a été demandé reste, le surplus
   * ira en réserve.
   */
  it("une baisse ne fait pas baisser le compte du four, mais la ligne dit le dû révisé", () => {
    const day = closedWith(order("a", [{ sku: "BAG", quantity: 10 }]));

    const raised = day.reviseOrder("a", [{ sku: "BAG", quantity: 3 }]);

    expect(raised).toEqual([]);
    expect(day.orders[0]?.lines[0]?.quantity).toBe(3);
    expect(countOfSku(day, "BAG")).toBe(10);
  });

  it("baisse puis hausse : le compte ne monte qu'au-delà de ce qui était déjà demandé", () => {
    const day = closedWith(order("a", [{ sku: "BAG", quantity: 10 }]));

    day.reviseOrder("a", [{ sku: "BAG", quantity: 3 }]);
    day.reviseOrder("a", [{ sku: "BAG", quantity: 8 }]);
    expect(countOfSku(day, "BAG")).toBe(10);

    day.reviseOrder("a", [{ sku: "BAG", quantity: 13 }]);
    expect(countOfSku(day, "BAG")).toBe(13);
  });

  it("un retirage après une baisse ne fait pas baisser le compte non plus", () => {
    const day = closedWith(order("a", [{ sku: "BAG", quantity: 10 }]));
    day.reviseOrder("a", [{ sku: "BAG", quantity: 3 }]);

    const absorbed = day.retake(
      [order("b", [{ sku: "BAG", quantity: 2 }])],
      new Set<string>(),
      LATER,
      "staff_1",
      null,
    );

    expect(absorbed).toBe(1);
    expect(countOfSku(day, "BAG")).toBe(10);
  });
});

describe("ProductionDay.reviseOrder — les refus", () => {
  it("refuse une journée qui n'est pas arrêtée : rien n'y est inscrit", () => {
    const day = ProductionDay.open(DAY);

    expect(() => day.reviseOrder("a", [{ sku: "BAG", quantity: 1 }])).toThrow(
      ProductionDayNotClosedError,
    );
  });

  it("refuse une commande absente du plan", () => {
    const day = closedWith(order("a", [{ sku: "BAG", quantity: 10 }]));

    expect(() => day.reviseOrder("z", [{ sku: "BAG", quantity: 1 }])).toThrow(
      RevisedOrderNotInPlanError,
    );
  });

  it.each([
    [
      "un article ajouté",
      [
        { sku: "BAG", quantity: 10 },
        { sku: "PAV", quantity: 1 },
      ],
    ],
    ["un article retiré", [{ sku: "CRO", quantity: 5 }]],
    [
      "une quantité à zéro",
      [
        { sku: "BAG", quantity: 0 },
        { sku: "CRO", quantity: 5 },
      ],
    ],
    [
      "une quantité non entière",
      [
        { sku: "BAG", quantity: 1.5 },
        { sku: "CRO", quantity: 5 },
      ],
    ],
  ])("refuse %s, et ne touche à rien", (_case, lines) => {
    const day = closedWith(
      order("a", [
        { sku: "BAG", quantity: 10 },
        { sku: "CRO", quantity: 5 },
      ]),
    );
    const before = day.toSnapshot();

    expect(() => day.reviseOrder("a", lines)).toThrow(RevisedLinesMismatchError);
    expect(day.toSnapshot()).toEqual(before);
  });
});
