import { type DayStock, type DayStockInput, dayStockOf } from "../day-stock.js";
import { estimateStock } from "../estimated-stock.js";
import { ResupplyReceipt } from "../resupply-receipt.js";
import type { PlacedSiteResupplySnapshot } from "../site-resupply.js";

/** Les dates ne sont comparées qu'entre elles : « Réceptionner » le jour même. */
const DAY = "2026-01-02";
const AT = new Date("2026-01-02T08:00:00Z");
const TRACE = { at: AT, author: { staffUserId: "s", name: "Lou", role: "counter" } };

function sent(
  id: string,
  quantity: number,
  overrides: Partial<PlacedSiteResupplySnapshot> = {},
): PlacedSiteResupplySnapshot {
  return {
    id,
    siteId: "site_1",
    target: "asap",
    serviceDay: DAY,
    version: 2,
    origin: "counter",
    name: null,
    lines: [{ sku: "CRO", label: "Croissant", quantity, saleUnit: "piece" as const }],
    placed: TRACE,
    cancelled: null,
    arrived: null,
    ...overrides,
  };
}

function receivedFor(resupply: PlacedSiteResupplySnapshot): ResupplyReceipt {
  const receipt = ResupplyReceipt.expecting(`receipt_${resupply.id}`, resupply);
  receipt.receiveAll(TRACE);
  return receipt;
}

/** La journée, son stock calculé sur ses propres reçus — sans prélèvement, sauf mention. */
function dayOf(input: Omit<DayStockInput, "stock">): DayStock {
  return dayStockOf({ ...input, stock: estimateStock(input.receipts, []) });
}

const EMPTY = { alerts: [], packed: new Map(), planStopped: false };

describe("la journée de stock d'un point (S1)", () => {
  it("garde un annulé déjà réceptionné, compté au stock : ce qui est arrivé reste arrivé", () => {
    const cancelled = sent("r1", 4, { cancelled: TRACE });

    const day = dayOf({
      ...EMPTY,
      resupplies: [cancelled],
      receipts: [receivedFor(cancelled)],
    });

    expect(day.resupplies.map((r) => r.state)).toEqual(["received"]);
    expect(day.products).toEqual([
      { sku: "CRO", label: "Croissant", stock: 4, alert: null, expected: 0, saleUnit: "piece" },
    ]);
  });

  it("n'attend rien d'un annulé non reçu, et ne compte jamais au stock un réassort seulement envoyé", () => {
    const day = dayOf({
      ...EMPTY,
      resupplies: [sent("r1", 4, { cancelled: TRACE }), sent("r2", 7)],
      receipts: [],
    });

    expect(day.resupplies.map((r) => r.resupplyId)).toEqual(["r2"]);
    expect(day.products).toEqual([
      { sku: "CRO", label: "Croissant", stock: 0, alert: null, expected: 7, saleUnit: "piece" },
    ]);
  });

  it("additionne le reçu et l'attendu d'un même produit", () => {
    const first = sent("r1", 4);

    const day = dayOf({
      ...EMPTY,
      resupplies: [first, sent("r2", 6)],
      receipts: [receivedFor(first)],
    });

    expect(day.products).toEqual([
      { sku: "CRO", label: "Croissant", stock: 4, alert: null, expected: 6, saleUnit: "piece" },
    ]);
  });
});

describe("la journée de stock d'un point — le reste décompté (lot L2)", () => {
  it("montre le stock reçu tout fait, prélèvements déjà déduits", () => {
    const first = sent("r1", 4);
    const receipts = [receivedFor(first)];

    const day = dayStockOf({
      ...EMPTY,
      resupplies: [first],
      receipts,
      stock: estimateStock(receipts, [
        { sku: "CRO", label: "Croissant", quantity: 3, saleUnit: "piece" as const },
      ]),
    });

    expect(day.products).toEqual([
      { sku: "CRO", label: "Croissant", stock: 1, alert: null, expected: 0, saleUnit: "piece" },
    ]);
  });
});
