import { withPricesPerKg, shownVariantSkus } from "../shop-catalogue-price-per-kg.js";
import { inShopLanguage, shopCatalogueOf } from "../shop-catalogue-view.js";
import { withOrderLimits } from "../shop-catalogue-order-limits.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * **Chaque déclinaison en vignette** (`plan-declinaisons-en-vignette.md`, V1,
 * V4, V6) : une vignette par déclinaison vivante quand la fiche le dit, sous
 * son SKU de vente, à son prix, son minimum, son unité et son prix au kilo.
 *
 * Une déclinaison archivée n'arrive pas ici : le commerce l'a retirée de la
 * vente (`STILL_SOLD`), le lecteur ne la rend pas.
 */

const SALE = {
  operations: [],
  operationOnlySkus: new Set<string>(),
  now: new Date(0),
  audience: "public" as const,
};

function florentins(variantsAsTiles: boolean) {
  return [
    catalogItem("CHO-001", { name: "Florentin", variantsAsTiles }),
    catalogItem("CHO-001", {
      sku: "CHO-001-2",
      isDefault: false,
      variantsAsTiles,
      name: "Florentin — Boîte de 220 g",
      unitPriceMillicents: 1_250_000,
      minQuantities: { pro: 4, public: 2 },
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: 100,
      orderTimeLimit: { daysBefore: 3, time: "12:00", graceMinutes: 0 },
    }),
  ];
}

describe("shopCatalogueOf — chaque déclinaison en vignette", () => {
  it("option cochée : deux déclinaisons vivantes, deux vignettes, chacune sous son SKU de vente", () => {
    const view = shopCatalogueOf(florentins(true), SALE);

    expect(view.items.map((item) => item.sku)).toEqual(["CHO-001", "CHO-001-2"]);
    expect(view.items[1]).toMatchObject({
      name: "Florentin — Boîte de 220 g",
      unitPriceMillicents: 1_250_000,
      minQuantity: 2,
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: 100,
    });
  });

  it("option décochée : la déclinaison par défaut seule, comme avant", () => {
    const view = shopCatalogueOf(florentins(false), SALE);

    expect(view.items.map((item) => item.sku)).toEqual(["CHO-001"]);
  });

  it("une déclinaison archivée — absente du vendable — n'a pas de vignette", () => {
    const [byDefault, box] = florentins(true);
    const view = shopCatalogueOf([byDefault!, box!].slice(0, 1), SALE);

    expect(view.items.map((item) => item.sku)).toEqual(["CHO-001"]);
  });

  it("le prix au kilo d'une vignette est celui de SA déclinaison", () => {
    const sellable = florentins(true);
    const view = shopCatalogueOf(sellable, SALE);
    const perKg = new Map([
      ["CHO-001-1", { proPricePerKgMillicents: 1, publicPricePerKgTtcCents: 1 }],
      ["CHO-001-2", { proPricePerKgMillicents: 5_000_000, publicPricePerKgTtcCents: 5_600 }],
    ]);

    expect(shownVariantSkus(view, sellable)).toEqual(["CHO-001-1", "CHO-001-2"]);
    expect(withPricesPerKg(view, sellable, perKg).items[1]).toMatchObject({
      sku: "CHO-001-2",
      publicPricePerKgTtcCents: 5_600,
    });
  });

  it("la limite de commande d'une vignette est celle de SA déclinaison", () => {
    const sellable = florentins(true);
    const items = withOrderLimits(shopCatalogueOf(sellable, SALE), sellable, []).items;

    expect(items[0]?.orderTimeLimit).toBeUndefined();
    expect(items[1]?.orderTimeLimit).toBeDefined();
  });

  it("traduit chaque vignette par SA déclinaison", () => {
    const [byDefault, box] = florentins(true);
    const sellable = [
      byDefault!,
      {
        ...box!,
        translations: { ...box!.translations, name: { en: "Florentin — Box of 220 g" } },
      },
    ];
    const view = inShopLanguage(shopCatalogueOf(sellable, SALE), sellable, "en");

    expect(view.items.map((item) => item.name)).toEqual(["Florentin", "Florentin — Box of 220 g"]);
  });
});
