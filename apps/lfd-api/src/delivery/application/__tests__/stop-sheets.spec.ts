import { FixedBinCatalog, FixedDeliveryProducts } from "../commands/__tests__/bin-doubles.js";
import {
  binTypeView,
  departingAll,
  FixedDepartures,
} from "../queries/__tests__/packing-doubles.js";
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

function sheets(departures: FixedDepartures): StopSheets {
  return new StopSheets(departures, PRODUCTS, CATALOG);
}

describe("StopSheets — la fiche de chaque arrêt (PL4)", () => {
  it("fusionne les lignes par SKU, y croise le froid, et compte les bacs prévus", async () => {
    const result = await sheets(
      departingAll(
        new Map([
          [
            "o1",
            [
              { sku: "VIE-001", name: "Croissant", quantity: 6, saleUnit: "piece" as const },
              { sku: "TAR-001", name: "Tarte", quantity: 2, saleUnit: "piece" as const },
              { sku: "VIE-001", name: "Croissant", quantity: 4, saleUnit: "piece" as const },
            ],
          ],
        ]),
      ),
    ).of(["o1", "o1"]);

    expect(result.get("o1")).toEqual({
      lines: [
        {
          sku: "VIE-001",
          name: "Croissant",
          quantity: 10,
          requiresCold: false,
          saleUnit: "piece" as const,
        },
        {
          sku: "TAR-001",
          name: "Tarte",
          quantity: 2,
          requiresCold: true,
          saleUnit: "piece" as const,
        },
      ],
      shortfall: null,
      // Un bac sec pour les croissants, un isotherme pour les tartes.
      binsExpected: 2,
    });
  });

  it("un produit sans contenance : la fiche le montre, les bacs prévus restent inconnus", async () => {
    const result = await sheets(
      departingAll(
        new Map([
          ["o1", [{ sku: "PAI-009", name: "Pain", quantity: 1, saleUnit: "piece" as const }]],
        ]),
      ),
    ).of(["o1"]);

    expect(result.get("o1")).toEqual({
      lines: [
        {
          sku: "PAI-009",
          name: "Pain",
          quantity: 1,
          requiresCold: false,
          saleUnit: "piece" as const,
        },
      ],
      shortfall: null,
      binsExpected: null,
    });
  });

  it("une commande sans ligne : fiche vide, rien d'attendu — on n'invente pas zéro", async () => {
    const result = await sheets(departingAll(new Map())).of(["o_inconnue"]);

    expect(result.get("o_inconnue")).toEqual({ lines: [], shortfall: null, binsExpected: null });
  });

  it("aucun arrêt : aucune lecture", async () => {
    await expect(sheets(departingAll(new Map())).of([])).resolves.toEqual(new Map());
  });

  /** Régression : la fiche de « Ma tournée » comptait les pièces commandées d'un départ incomplet décidé (2026-10-25). */
  it("un départ incomplet décidé : la fiche dit ce qui part, et porte le reste", async () => {
    const shortfall = {
      remainder: "abandoned" as const,
      lines: [
        { sku: "VIE-001", productName: "Croissant", quantity: 4, saleUnit: "piece" as const },
      ],
    };
    const result = await sheets(
      new FixedDepartures(
        new Map([
          [
            "o1",
            {
              lines: [
                { sku: "VIE-001", name: "Croissant", quantity: 6, saleUnit: "piece" as const },
              ],
              shortfall,
            },
          ],
        ]),
      ),
    ).of(["o1"]);

    expect(result.get("o1")).toMatchObject({
      lines: [
        {
          sku: "VIE-001",
          name: "Croissant",
          quantity: 6,
          requiresCold: false,
          saleUnit: "piece" as const,
        },
      ],
      shortfall,
    });
  });
});
