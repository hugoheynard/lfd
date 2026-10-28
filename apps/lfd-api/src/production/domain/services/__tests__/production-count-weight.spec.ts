import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { countOf, floorCounts, freezeOrder, freezeResupply } from "../production-count.js";

/**
 * **Le compte à produire au poids** (plan `documentation/pricing/plan-vente-au-poids.md`,
 * P6) — pur, sans Nest. Une ligne au poids se compte en grammes, par article :
 * l'unité est celle de l'article, une seule par SKU.
 */

type Line = ProducibleOrder["lines"][number];

const croissants = (quantity: number): Line => ({
  sku: "VIE-001",
  productName: "Croissant",
  quantity,
  saleUnit: "piece",
});
const salmon = (grams: number): Line => ({
  sku: "TRA-SAU",
  productName: "Saumon gravlax",
  quantity: grams,
  saleUnit: "weight",
});

function order(orderId: string, lines: readonly Line[]): ProducibleOrder {
  return {
    orderId,
    reference: `ORD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines,
  };
}

describe("countOf — au poids", () => {
  it("additionne les grammes d'un article au poids à travers les commandes du jour", () => {
    const counts = countOf(
      [order("a", [salmon(500)]), order("b", [salmon(750)]), order("c", [salmon(1250)])].map(
        freezeOrder,
      ),
    );

    expect(counts).toEqual([
      {
        sku: "TRA-SAU",
        productName: "Saumon gravlax",
        quantity: 2500,
        saleUnit: "weight",
        done: null,
      },
    ]);
  });

  it("mêle pièce et poids dans une même commande sans additionner l'un à l'autre", () => {
    const counts = countOf([order("a", [croissants(12), salmon(1250)])].map(freezeOrder));

    expect(counts).toEqual([
      {
        sku: "TRA-SAU",
        productName: "Saumon gravlax",
        quantity: 1250,
        saleUnit: "weight",
        done: null,
      },
      { sku: "VIE-001", productName: "Croissant", quantity: 12, saleUnit: "piece", done: null },
    ]);
  });

  it("mêle pièce et poids dans une même journée, chaque article dans son unité", () => {
    const counts = countOf(
      [
        order("a", [croissants(12)]),
        order("b", [salmon(200), croissants(30)]),
        order("c", [salmon(1_000_000)]),
      ].map(freezeOrder),
    );

    expect(counts.map((item) => [item.sku, item.quantity, item.saleUnit])).toEqual([
      ["TRA-SAU", 1_000_200, "weight"],
      ["VIE-001", 42, "piece"],
    ]);
  });

  it("refuse un même article à la pièce et au poids plutôt que d'additionner 12 et 1 250", () => {
    const confused: Line = { ...salmon(1250), saleUnit: "piece", quantity: 12 };

    expect(() =>
      countOf([order("a", [salmon(1250)]), order("b", [confused])].map(freezeOrder)),
    ).toThrow(/à la fois à la pièce et au poids/u);
  });

  it("garde l'unité au plancher d'un recompte : 1 250 g puis 1 000 g gardent 1 250 g", () => {
    const before = countOf([order("a", [salmon(1250)])].map(freezeOrder));
    const after = countOf([order("a", [salmon(1000)])].map(freezeOrder));

    expect(floorCounts(before, after)).toEqual([
      {
        sku: "TRA-SAU",
        productName: "Saumon gravlax",
        quantity: 1250,
        saleUnit: "weight",
        done: null,
      },
    ]);
  });
});

describe("freezeOrder / freezeResupply — l'unité est recopiée, jamais déduite", () => {
  it("fige l'unité de chaque ligne de commande", () => {
    expect(freezeOrder(order("a", [croissants(3), salmon(500)])).lines).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 3, saleUnit: "piece" },
      { sku: "TRA-SAU", productName: "Saumon gravlax", quantity: 500, saleUnit: "weight" },
    ]);
  });

  it("fige un réassort à la pièce : le commerce refuse le poids au réassort", () => {
    const frozen = freezeResupply({
      resupplyId: "r",
      siteId: "s",
      siteLabel: null,
      name: null,
      servedByTransfer: false,
      lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6 }],
    });

    expect(frozen.lines).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" },
    ]);
  });
});
