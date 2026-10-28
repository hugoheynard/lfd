import { shopCatalogueOf } from "../shop-catalogue-view.js";
import { shownVariantSkus, withPricesPerKg } from "../shop-catalogue-price-per-kg.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * Les prix au kilo sur le rayon (`plan-prix-au-kilo.md`, K3) : posés tels que
 * saisis, les deux, chacun nommé par son unité — et `null` quand rien n'est
 * saisi, jamais un montant inventé.
 */

const SALE = {
  operations: [],
  operationOnlySkus: new Set<string>(),
  now: new Date(0),
  audience: "public" as const,
};
const SELLABLE = [
  catalogItem("PAI-001"),
  catalogItem("PAI-001", { sku: "PAI-001-2", isDefault: false }),
  catalogItem("VIE-001"),
];

describe("withPricesPerKg", () => {
  it("pose les deux prix saisis de la déclinaison par défaut, sur le SKU produit", () => {
    const view = shopCatalogueOf(SELLABLE, SALE);
    const perKg = new Map([
      ["PAI-001-1", { proPricePerKgMillicents: 1_234_567, publicPricePerKgTtcCents: 1_240 }],
      ["PAI-001-2", { proPricePerKgMillicents: 9, publicPricePerKgTtcCents: 9 }],
    ]);

    const items = withPricesPerKg(view, SELLABLE, perKg).items;

    expect(items.find((item) => item.sku === "PAI-001")).toMatchObject({
      proPricePerKgMillicents: 1_234_567,
      publicPricePerKgTtcCents: 1_240,
    });
  });

  it("rend `null` aux deux quand rien n'est saisi — jamais l'absence ni un zéro", () => {
    const view = shopCatalogueOf(SELLABLE, SALE);

    const items = withPricesPerKg(view, SELLABLE, new Map()).items;

    expect(items.find((item) => item.sku === "VIE-001")).toMatchObject({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: null,
    });
  });

  it("ne touche ni au prix à la pièce ni au TTC", () => {
    const view = shopCatalogueOf(SELLABLE, SALE);
    const perKg = new Map([
      ["PAI-001-1", { proPricePerKgMillicents: 1_000_000, publicPricePerKgTtcCents: 1_000 }],
    ]);

    const [before] = view.items;
    const [after] = withPricesPerKg(view, SELLABLE, perKg).items;

    expect(after?.unitPriceMillicents).toBe(before?.unitPriceMillicents);
    expect(after?.unitPriceTtcCents).toBe(before?.unitPriceTtcCents);
  });
});

describe("shownVariantSkus", () => {
  it("demande les seules déclinaisons par défaut montrées", () => {
    const view = shopCatalogueOf(SELLABLE, SALE);

    expect(shownVariantSkus(view, SELLABLE)).toEqual(["PAI-001-1", "VIE-001-1"]);
  });
});
