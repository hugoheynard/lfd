import { manifestOf, totalsBySku } from "../transfer-manifest.js";

describe("le manifeste d'un transfert (décision de Hugo du 2026-10-13)", () => {
  it("additionne par SKU, dans l'ordre de première apparition, sous le premier libellé", () => {
    expect(
      totalsBySku([
        { sku: "B", productName: "Brioche", quantity: 1, saleUnit: "piece" },
        { sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" },
        { sku: "B", productName: "Brioche (ancien nom)", quantity: 4, saleUnit: "piece" },
      ]),
    ).toEqual([
      { sku: "B", productName: "Brioche", quantity: 5, saleUnit: "piece" },
      { sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" },
    ]);
  });

  it("sépare commandes et réapprovisionnement, et totalise tous genres confondus", () => {
    const manifest = manifestOf([
      {
        itemId: "i_1",
        kind: "order",
        subjectId: "o_1",
        lines: [{ sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" }],
      },
      {
        itemId: "i_2",
        kind: "resupply",
        subjectId: "rf_1",
        lines: [{ sku: "A", productName: "Pain", quantity: 10, saleUnit: "piece" }],
      },
    ]);

    expect(manifest.orders.totals).toEqual([
      { sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" },
    ]);
    expect(manifest.resupplies.totals).toEqual([
      { sku: "A", productName: "Pain", quantity: 10, saleUnit: "piece" },
    ]);
    expect(manifest.totals).toEqual([
      { sku: "A", productName: "Pain", quantity: 12, saleUnit: "piece" },
    ]);
  });

  it("un article au poids s'additionne en grammes et garde son unité (P6, vente au poids)", () => {
    expect(
      totalsBySku([
        { sku: "SAU", productName: "Saumon", quantity: 1250, saleUnit: "weight" },
        { sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" },
        { sku: "SAU", productName: "Saumon", quantity: 500, saleUnit: "weight" },
      ]),
    ).toEqual([
      { sku: "SAU", productName: "Saumon", quantity: 1750, saleUnit: "weight" },
      { sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" },
    ]);
  });

  it("une commande mêlée : pièces et grammes côte à côte, chacun dans son unité", () => {
    const manifest = manifestOf([
      {
        itemId: "i_1",
        kind: "order",
        subjectId: "o_1",
        lines: [
          { sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" },
          { sku: "SAU", productName: "Saumon", quantity: 1250, saleUnit: "weight" },
        ],
      },
    ]);

    expect(manifest.totals).toEqual([
      { sku: "A", productName: "Pain", quantity: 2, saleUnit: "piece" },
      { sku: "SAU", productName: "Saumon", quantity: 1250, saleUnit: "weight" },
    ]);
  });

  it("un transfert vide a un manifeste vide", () => {
    expect(manifestOf([])).toEqual({
      orders: { items: [], totals: [] },
      resupplies: { items: [], totals: [] },
      totals: [],
    });
  });
});
