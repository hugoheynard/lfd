import { draftLineOf } from "../bakehouse-resupply-draft-content.js";
import { dayStockOf } from "../day-stock.js";
import { estimateStock } from "../estimated-stock.js";
import { expectedLinesOf, ResupplyReceipt } from "../resupply-receipt.js";
import { ResupplyReceiptLine } from "../resupply-receipt-line.js";
import { resupplySaleUnitOf } from "../resupply-sale-unit.js";
import {
  ResupplyLineUnitMismatchError,
  UnknownResupplySaleUnitError,
  WeightResupplyNotSendableError,
} from "../resupply-sale-unit-errors.js";
import { type PlacedSiteResupplySnapshot, SiteResupply } from "../site-resupply.js";
import { SiteResupplyLine } from "../site-resupply-line.js";

/** Les dates ne sont comparées qu'entre elles et à l'instant figé du geste. */
const DAY = "2026-01-02";
const AT = new Date("2026-01-02T08:00:00Z");
const TRACE = { at: AT, author: { staffUserId: "s", name: "Lou", role: "counter" } };

const SALMON_GRAMS = { sku: "SAU", label: "Saumon gravlax", saleUnit: "weight" as const };
const SALMON_PIECES = { sku: "SAU", label: "Saumon gravlax", saleUnit: "piece" as const };

function unordered(): ResupplyReceipt {
  return ResupplyReceipt.openUnordered({ id: "rc", siteId: "site_1", serviceDay: DAY });
}

describe("l'unité d'une ligne de réassort (lot L2b-1)", () => {
  it("relit `piece` et `weight`, et refuse toute autre valeur sans repli sur la pièce", () => {
    expect(resupplySaleUnitOf("CRO", "piece")).toBe("piece");
    expect(resupplySaleUnitOf("SAU", "weight")).toBe("weight");
    expect(() => resupplySaleUnitOf("SAU", "kilo")).toThrow(UnknownResupplySaleUnitError);
  });

  it("une ligne de brouillon sans unité est à la pièce (brouillon d'avant le lot)", () => {
    expect(draftLineOf({ sku: "CRO", quantity: 3 })).toEqual({
      sku: "CRO",
      quantity: 3,
      saleUnit: "piece",
    });
    expect(draftLineOf({ sku: "SAU", quantity: 500, saleUnit: "weight" }).saleUnit).toBe("weight");
  });
});

describe("la demande de réassort au poids", () => {
  it("additionne deux ajouts au poids, en grammes", () => {
    const resupply = SiteResupply.draft({ id: "r", siteId: "site_1", target: "asap", at: AT });
    resupply.addLine(SiteResupplyLine.of({ ...SALMON_GRAMS, quantity: 1250 }));
    resupply.addLine(SiteResupplyLine.of({ ...SALMON_GRAMS, quantity: 250 }));

    expect(resupply.lines).toEqual([
      expect.objectContaining({ sku: "SAU", quantity: 1500, saleUnit: "weight" }),
    ]);
  });

  it("refuse le même article dans l'autre unité, sans toucher à la ligne", () => {
    const resupply = SiteResupply.draft({ id: "r", siteId: "site_1", target: "asap", at: AT });
    resupply.addLine(SiteResupplyLine.of({ ...SALMON_GRAMS, quantity: 500 }));

    expect(() => resupply.addLine(SiteResupplyLine.of({ ...SALMON_PIECES, quantity: 2 }))).toThrow(
      ResupplyLineUnitMismatchError,
    );
    expect(resupply.lines.map((line) => line.quantity)).toEqual([500]);
  });

  it("ne part pas au fournil tant qu'elle porte une ligne au poids", () => {
    const resupply = SiteResupply.draft({ id: "r", siteId: "site_1", target: "asap", at: AT });
    resupply.addLine(
      SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 6, saleUnit: "piece" }),
    );
    resupply.addLine(SiteResupplyLine.of({ ...SALMON_GRAMS, quantity: 500 }));

    expect(() => resupply.place(TRACE, null, false)).toThrow(WeightResupplyNotSendableError);
    expect(() => resupply.place(TRACE, null, false)).toThrow("« Saumon gravlax »");
    expect(resupply.status).toBe("draft");
  });
});

describe("le reçu au poids", () => {
  it("accepte une ligne au poids sans commande, et refuse le même article dans l'autre unité", () => {
    const receipt = unordered();
    receipt.receive(ResupplyReceiptLine.unordered({ ...SALMON_GRAMS, quantity: 5000 }), TRACE);

    expect(() =>
      receipt.receive(ResupplyReceiptLine.unordered({ ...SALMON_PIECES, quantity: 2 }), TRACE),
    ).toThrow(ResupplyLineUnitMismatchError);
    expect(receipt.lines).toEqual([
      expect.objectContaining({ sku: "SAU", receivedQuantity: 5000, saleUnit: "weight" }),
    ]);
  });

  it("l'emballé du colisage (des pièces) ne remplace jamais une ligne au poids", () => {
    const lines = expectedLinesOf(
      {
        lines: [
          { sku: "CRO", label: "Croissant", quantity: 24, saleUnit: "piece" },
          { ...SALMON_GRAMS, quantity: 1500 },
        ],
      },
      new Map([
        ["CRO", 20],
        ["SAU", 1],
      ]),
    );

    expect(lines.map((line) => [line.sku, line.quantity, line.saleUnit])).toEqual([
      ["CRO", 20, "piece"],
      ["SAU", 1500, "weight"],
    ]);
  });
});

describe("le reste du jour par (article, unité)", () => {
  it("ne somme jamais pièces et grammes d'un même article", () => {
    const receipt = unordered();
    receipt.receive(ResupplyReceiptLine.unordered({ ...SALMON_GRAMS, quantity: 5000 }), TRACE);

    const stock = estimateStock(
      [receipt],
      [
        { ...SALMON_GRAMS, quantity: 1250 },
        { ...SALMON_PIECES, quantity: 1 },
      ],
    );

    expect(stock).toEqual([
      { ...SALMON_GRAMS, receivedQuantity: 5000, estimatedStock: 3750 },
      { ...SALMON_PIECES, receivedQuantity: 0, estimatedStock: -1 },
    ]);
  });

  it("l'onglet Stock compte grammes et pièces à part, et l'alerte se pose sur chaque compte", () => {
    const receipt = unordered();
    receipt.receive(ResupplyReceiptLine.unordered({ ...SALMON_GRAMS, quantity: 5000 }), TRACE);
    const sent: PlacedSiteResupplySnapshot = {
      id: "r1",
      siteId: "site_1",
      target: "asap",
      serviceDay: DAY,
      version: 2,
      origin: "counter",
      name: null,
      lines: [
        { sku: "CRO", label: "Croissant", quantity: 12, saleUnit: "piece" },
        { ...SALMON_GRAMS, quantity: 750 },
      ],
      placed: TRACE,
      cancelled: null,
      arrived: null,
    };

    const day = dayStockOf({
      resupplies: [sent],
      receipts: [receipt],
      stock: estimateStock([receipt], [{ ...SALMON_GRAMS, quantity: 1250 }]),
      alerts: [
        {
          id: "a",
          siteId: "site_1",
          sku: "SAU",
          label: "Saumon gravlax",
          level: "low",
          version: 1,
          declared: TRACE,
          lifted: null,
        },
      ],
      packed: new Map(),
      planStopped: false,
    });

    expect(day.resupplies[0]).toMatchObject({ pieces: 12, weightGrams: 750 });
    expect(day.products).toEqual([
      { ...SALMON_GRAMS, stock: 3750, alert: "low", expected: 750 },
      { sku: "CRO", label: "Croissant", saleUnit: "piece", stock: 0, alert: null, expected: 12 },
    ]);
  });
});
