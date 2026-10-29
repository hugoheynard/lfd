import { ensureSaleQuantity } from "../../../src/b2b/orders/domain/services/sale-quantity-rules.js";
import { DELIVERY_DAY, WEIGHED_SKUS } from "../../../src/dev/seeding/delivery-day.seed.js";
import { saleTerms } from "../../../src/pim/catalogue/product/domain/value-objects/sale-terms.js";
import { minQuantities } from "../../../src/pim/catalogue/product/domain/value-objects/min-quantities.js";
import { seedSaleTerms } from "../capabilities.js";
import { CATALOGUE } from "../catalogue.js";
import type { CorpusProduct } from "../corpus.js";
import { rootFamilyOf } from "../family-roots.js";

/**
 * Le corpus du référentiel montre ce qui a été bâti (Hugo, 2026-10-29 : « je
 * veux que ma seed reflète la réalité de ce qu'on a bâti ») — au moins un
 * exemple de chaque geste de fiche, et des valeurs que le domaine accepte.
 * Le rejeu lui-même passe par les vrais handlers (`replay.ts`) ; ce que ces
 * tests tiennent, c'est que la donnée qu'il leur tend n'est pas refusée.
 */
const SEA_FAMILY = "Traiteur de la mer";
const SALTY_ROOT = "Salé & traiteur";

function product(sku: string): CorpusProduct {
  const found = CATALOGUE.products.find((candidate) => candidate.sku === sku);
  if (found === undefined) {
    throw new Error(`${sku} absent du corpus.`);
  }
  return found;
}

describe("le corpus — vente au poids", () => {
  const weighed = CATALOGUE.products.filter((candidate) => candidate.soldByWeight !== undefined);

  it("range le traiteur de la mer sous le salé, et y vend au poids", () => {
    const sea = CATALOGUE.categories.find((category) => category.name.fr === SEA_FAMILY);
    expect(sea?.parentName).toBe(SALTY_ROOT);
    expect(weighed.length).toBeGreaterThanOrEqual(2);
    expect(weighed.every((candidate) => candidate.categoryName === SEA_FAMILY)).toBe(true);
    expect(weighed.map((candidate) => candidate.name.fr)).toEqual(
      expect.arrayContaining(["Saumon gravlax maison", "Saumon fumé au bois de hêtre"]),
    );
  });

  it("pose des conditions que le domaine accepte, avec un prix au kilo dans les deux audiences", () => {
    for (const candidate of weighed) {
      const terms = seedSaleTerms(candidate);
      expect(terms.saleUnit).toBe("weight");
      expect(() =>
        saleTerms({
          saleUnit: "weight",
          weightMinGrams: terms.weightMinGrams ?? null,
          weightStepGrams: terms.weightStepGrams ?? null,
        }),
      ).not.toThrow();
      expect(candidate.priceCents).toBeGreaterThan(0);
      expect(Number(candidate.proPriceHt)).toBeGreaterThan(0);
      expect(candidate.weightGrams).toBeNull();
    }
  });

  it("ne pose rien sur un article à la pièce", () => {
    expect(seedSaleTerms(product("PAI-001"))).toEqual({});
  });
});

describe("le corpus — les autres gestes de fiche", () => {
  it("ne laisse plus aucun article salé à la racine de sa famille", () => {
    const salty = CATALOGUE.products.filter(
      (candidate) => rootFamilyOf(candidate.categoryName) === SALTY_ROOT,
    );
    expect(salty.length).toBeGreaterThan(0);
    expect(salty.filter((candidate) => candidate.categoryName === SALTY_ROOT)).toEqual([]);
  });

  it("pose une quantité minimale par audience, que le domaine accepte", () => {
    const withMinimum = CATALOGUE.products.filter(
      (candidate) => candidate.minQuantities !== undefined,
    );
    expect(withMinimum.length).toBeGreaterThanOrEqual(1);
    for (const candidate of withMinimum) {
      // Un minimum en pièces sur un article au poids est refusé par l'agrégat.
      expect(candidate.soldByWeight).toBeUndefined();
      const pair = candidate.minQuantities ?? { pro: null, public: null };
      expect(() => minQuantities(pair)).not.toThrow();
    }
  });

  it("montre une fiche à plusieurs déclinaisons, nommées pour la boutique, dont une archivée", () => {
    const tiled = CATALOGUE.products.filter((candidate) => (candidate.variants ?? []).length > 0);
    expect(tiled.length).toBeGreaterThanOrEqual(1);
    const variants = tiled.flatMap((candidate) => candidate.variants ?? []);
    expect(variants.some((variant) => variant.discontinued === true)).toBe(true);
    expect(variants.some((variant) => variant.discontinued !== true)).toBe(true);
    for (const variant of variants) {
      expect(variant.shopName.fr).not.toBe(variant.internalLabel);
    }
    const skus = variants.map((variant) => variant.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });
});

describe("la commande mêlée du scénario de dev", () => {
  /**
   * Le scénario (`delivery-day.seed.ts`) commande les articles au poids de ce
   * corpus : ses grammes doivent tomber dans le pas et au-dessus du minimum,
   * sans quoi la passation refuserait la journée entière.
   */
  it("mêle des pièces et des grammes que la passation accepte", () => {
    const mixed = DELIVERY_DAY.filter((entry) =>
      entry.lines.some((line) => line.saleUnit === "weight"),
    );
    expect(mixed.length).toBeGreaterThanOrEqual(1);
    for (const entry of mixed) {
      expect(entry.lines.some((line) => line.saleUnit === undefined)).toBe(true);
      for (const line of entry.lines.filter((candidate) => candidate.saleUnit === "weight")) {
        const terms = product(line.sku).soldByWeight;
        expect(terms).toBeDefined();
        expect(() =>
          ensureSaleQuantity(
            {
              sku: line.sku,
              saleUnit: "weight",
              weightMinGrams: terms?.weightMinGrams ?? null,
              weightStepGrams: terms?.weightStepGrams ?? null,
            },
            { quantity: line.quantity, saleUnit: "weight" },
          ),
        ).not.toThrow();
        expect(line.quantity).toBeGreaterThan(terms?.weightMinGrams ?? 0);
      }
    }
    expect(WEIGHED_SKUS.every((sku) => product(sku).soldByWeight !== undefined)).toBe(true);
  });
});
