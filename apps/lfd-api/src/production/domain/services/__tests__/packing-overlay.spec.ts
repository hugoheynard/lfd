import type { ProductionOrderSnapshot } from "../../entities/production-day.snapshot.js";
import { overlayStation, stationAvailable } from "../packing-overlay.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");

const ORDER: ProductionOrderSnapshot = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  // Une ligne « au bac » côté fournil : sur une journée `packing`, elle ne
  // compte pas — c'est le colisage qui sait.
  packed: { at: AT, by: "fantome" },
  containers: 9,
  lines: [
    { sku: "CRO", productName: "Croissant", quantity: 12, packed: null },
    { sku: "PAI", productName: "Pain", quantity: 2, packed: { at: AT, by: "x", initials: "" } },
  ],
};

describe("overlayStation — le plan du fournil, le bac du colisage", () => {
  it("prend la fermeture, les containers et les lignes au colisage", () => {
    const [order] = overlayStation([ORDER], {
      orders: [
        {
          orderId: "ord_1",
          packed: null,
          containers: 2,
          lines: [{ sku: "CRO", packed: { at: AT, by: "s1", initials: "MB" } }],
        },
      ],
      stocks: [],
    });

    expect(order).toMatchObject({ packed: null, containers: 2, reference: "CMD-0001" });
    expect(order?.lines.map((line) => line.packed)).toEqual([
      { at: AT, by: "s1", initials: "MB" },
      null,
    ]);
  });

  it("une commande inconnue du colisage se lit ouverte, vide, sans container", () => {
    const [order] = overlayStation([ORDER], { orders: [], stocks: [] });

    expect(order).toMatchObject({ packed: null, containers: 0 });
    expect(order?.lines.every((line) => line.packed === null)).toBe(true);
  });
});

describe("stationAvailable — reçu − rendu − au bac", () => {
  it("se calcule par article, zéro pour un article jamais remis, négatif possible", () => {
    const available = stationAvailable({
      orders: [],
      stocks: [
        { sku: "CRO", received: 20, returned: 3, packed: 12 },
        { sku: "PAI", received: 1, returned: 0, packed: 2 },
      ],
    });

    expect(available("CRO")).toBe(5);
    expect(available("PAI")).toBe(-1);
    expect(available("BAG")).toBe(0);
  });
});
