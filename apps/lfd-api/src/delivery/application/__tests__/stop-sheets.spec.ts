import { FixedBinCatalog, FixedDeliveryProducts } from "../commands/__tests__/bin-doubles.js";
import { binTypeView, FixedOrderLines } from "../queries/__tests__/packing-doubles.js";
import { StopSheets } from "../stop-sheets.js";

const CATALOG = new FixedBinCatalog(
  [binTypeView("bin_s", { isotherm: true }), binTypeView("bin_m")],
  [
    { binTypeId: "bin_m", sku: "VIE-001", units: 24 },
    { binTypeId: "bin_s", sku: "TAR-001", units: 4 },
  ],
);
const PRODUCTS = new FixedDeliveryProducts([
  { sku: "VIE-001", name: "Croissant", requiresCold: false },
  { sku: "TAR-001", name: "Tarte", requiresCold: true },
]);

function sheets(lines: FixedOrderLines): StopSheets {
  return new StopSheets(lines, PRODUCTS, CATALOG);
}

describe("StopSheets — la fiche de chaque arrêt (PL4)", () => {
  it("fusionne les lignes par SKU, y croise le froid, et compte les bacs prévus", async () => {
    const result = await sheets(
      new FixedOrderLines(
        new Map([
          [
            "o1",
            [
              { sku: "VIE-001", name: "Croissant", quantity: 6 },
              { sku: "TAR-001", name: "Tarte", quantity: 2 },
              { sku: "VIE-001", name: "Croissant", quantity: 4 },
            ],
          ],
        ]),
      ),
    ).of(["o1", "o1"]);

    expect(result.get("o1")).toEqual({
      lines: [
        { sku: "VIE-001", name: "Croissant", quantity: 10, requiresCold: false },
        { sku: "TAR-001", name: "Tarte", quantity: 2, requiresCold: true },
      ],
      // Un bac sec pour les croissants, un isotherme pour les tartes.
      binsExpected: 2,
    });
  });

  it("un produit sans contenance : la fiche le montre, les bacs prévus restent inconnus", async () => {
    const result = await sheets(
      new FixedOrderLines(new Map([["o1", [{ sku: "PAI-009", name: "Pain", quantity: 1 }]]])),
    ).of(["o1"]);

    expect(result.get("o1")).toEqual({
      lines: [{ sku: "PAI-009", name: "Pain", quantity: 1, requiresCold: false }],
      binsExpected: null,
    });
  });

  it("une commande sans ligne : fiche vide, rien d'attendu — on n'invente pas zéro", async () => {
    const result = await sheets(new FixedOrderLines(new Map())).of(["o_inconnue"]);

    expect(result.get("o_inconnue")).toEqual({ lines: [], binsExpected: null });
  });

  it("aucun arrêt : aucune lecture", async () => {
    await expect(sheets(new FixedOrderLines(new Map())).of([])).resolves.toEqual(new Map());
  });
});
