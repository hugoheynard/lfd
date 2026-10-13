import { manifestOf, totalsBySku } from "../transfer-manifest.js";

describe("le manifeste d'un transfert (décision de Hugo du 2026-10-13)", () => {
  it("additionne par SKU, dans l'ordre de première apparition, sous le premier libellé", () => {
    expect(
      totalsBySku([
        { sku: "B", productName: "Brioche", quantity: 1 },
        { sku: "A", productName: "Pain", quantity: 2 },
        { sku: "B", productName: "Brioche (ancien nom)", quantity: 4 },
      ]),
    ).toEqual([
      { sku: "B", productName: "Brioche", quantity: 5 },
      { sku: "A", productName: "Pain", quantity: 2 },
    ]);
  });

  it("sépare commandes et réassort, et totalise tous genres confondus", () => {
    const manifest = manifestOf([
      {
        itemId: "i_1",
        kind: "order",
        subjectId: "o_1",
        lines: [{ sku: "A", productName: "Pain", quantity: 2 }],
      },
      {
        itemId: "i_2",
        kind: "refill",
        subjectId: "rf_1",
        lines: [{ sku: "A", productName: "Pain", quantity: 10 }],
      },
    ]);

    expect(manifest.orders.totals).toEqual([{ sku: "A", productName: "Pain", quantity: 2 }]);
    expect(manifest.refills.totals).toEqual([{ sku: "A", productName: "Pain", quantity: 10 }]);
    expect(manifest.totals).toEqual([{ sku: "A", productName: "Pain", quantity: 12 }]);
  });

  it("un transfert vide a un manifeste vide", () => {
    expect(manifestOf([])).toEqual({
      orders: { items: [], totals: [] },
      refills: { items: [], totals: [] },
      totals: [],
    });
  });
});
