import { InvalidVariantPricingError, ZeroPricePerKgError } from "../../errors/product-errors.js";
import {
  DefaultVariantCannotFollowMinQuantityError,
  MinQuantityOnWeightSaleError,
} from "../../errors/min-quantity-errors.js";
import {
  SaleReferenceInUseError,
  SaleReferenceUsageUnknownError,
} from "../../errors/sale-unit-errors.js";
import { ProPriceHt } from "../../value-objects/pro-price-ht.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { VariantSale } from "../variant-sale.js";
import { openedSnapshot } from "../variant-snapshot-mapper.js";
import type { VariantSnapshot } from "../variant-snapshot.js";

const SKU = "CHO-001-2";
const NOT_USED = { answered: true, uses: [] } as const;

function born(): VariantSnapshot {
  return openedSnapshot({
    id: "var_2",
    sku: Sku.create(SKU),
    name: { fr: "Sœur" },
    options: {},
    position: 1,
    customRecipe: false,
  });
}

const aSale = (): VariantSale => VariantSale.fromSnapshot(born());
const OWNER = { isDefault: false, sku: SKU };

describe("VariantSale — comment une déclinaison se vend", () => {
  describe("tarif", () => {
    it("pose le prix et le poids, et rend un nouvel état sans toucher l'ancien", () => {
      const sale = aSale();
      const priced = sale.price({ priceCents: 1200, weightGrams: 220 }, SKU);
      expect(priced.fields).toMatchObject({ priceCents: 1200, weightGrams: 220 });
      expect(sale.fields.priceCents).toBeNull();
    });

    it("refuse un prix ou un poids non entier ou négatif, sans rien changer", () => {
      expect(() => aSale().price({ priceCents: 12.5, weightGrams: null }, SKU)).toThrow(
        InvalidVariantPricingError,
      );
      expect(() => aSale().price({ priceCents: 100, weightGrams: -1 }, SKU)).toThrow(
        InvalidVariantPricingError,
      );
    });

    it("« absent = inchangé » : un envoi sans prix pro ne l'efface pas, `null` l'efface", () => {
      const withPro = aSale().price(
        { priceCents: 100, weightGrams: 10, proPrice: ProPriceHt.fromEuros("3") },
        SKU,
      );
      expect(withPro.hasOwnProPrice).toBe(true);
      const kept = withPro.price({ priceCents: 110, weightGrams: 10 }, SKU);
      expect(kept.fields.proPriceMillicents).toBe(withPro.fields.proPriceMillicents);
      expect(
        kept.price({ priceCents: 110, weightGrams: 10, proPrice: null }, SKU).hasOwnProPrice,
      ).toBe(false);
    });

    it("refuse un prix au kilo à zéro", () => {
      expect(() =>
        aSale().price({ priceCents: 1, weightGrams: 1, publicPricePerKgTtcCents: 0 }, SKU),
      ).toThrow(ZeroPricePerKgError);
    });

    it("(dés)aligne le tarif sans effacer le tarif propre", () => {
      const own = aSale().price({ priceCents: 500, weightGrams: 50 }, SKU);
      const roundTrip = own.alignPricing(true).alignPricing(false);
      expect(roundTrip.fields.priceCents).toBe(500);
      expect(own.alignPricing(true).followsPricing).toBe(true);
    });
  });

  describe("unité de vente", () => {
    it("une unité qui ne change pas ne demande l'avis de personne", () => {
      const sale = aSale().price({ priceCents: 1, weightGrams: 1, weightMinGrams: null }, SKU);
      expect(sale.saleUnit).toBe("piece");
    });

    it("passer au poids exige la réponse du commerce, et que la référence n'ait pas servi", () => {
      const toWeight = {
        priceCents: 1,
        weightGrams: 1,
        saleUnit: "weight",
        weightStepGrams: 50,
      } as const;
      expect(() => aSale().price(toWeight, SKU)).toThrow(SaleReferenceUsageUnknownError);
      expect(() =>
        aSale().price(toWeight, SKU, { answered: false, cause: new Error("coupé") }),
      ).toThrow(SaleReferenceUsageUnknownError);
      expect(() => aSale().price(toWeight, SKU, { answered: true, uses: ["order"] })).toThrow(
        SaleReferenceInUseError,
      );
      expect(aSale().price(toWeight, SKU, NOT_USED).saleUnit).toBe("weight");
    });
  });

  describe("quantité minimale", () => {
    it("pose une paire, cesse de suivre, et dit si quelque chose a changé", () => {
      const first = aSale().changeMinQuantities({ pro: 6, public: null }, OWNER);
      expect(first.changed).toBe(true);
      expect(first.sale.fields.minQuantities).toEqual({ pro: 6, public: null });
      expect(first.sale.changeMinQuantities({ pro: 6, public: null }, OWNER).changed).toBe(false);
    });

    it("« follow » garde la paire propre qui dort, et le défaut ne peut pas se suivre", () => {
      const own = aSale().changeMinQuantities({ pro: 6, public: null }, OWNER).sale;
      const followed = own.changeMinQuantities("follow", OWNER);
      expect(followed.changed).toBe(true);
      expect(followed.sale.fields.minQuantities).toEqual({ pro: 6, public: null });
      expect(() => aSale().changeMinQuantities("follow", { ...OWNER, isDefault: true })).toThrow(
        DefaultVariantCannotFollowMinQuantityError,
      );
    });

    it("au poids, seule la paire vide passe", () => {
      const byWeight = aSale().price(
        { priceCents: 1, weightGrams: 1, saleUnit: "weight", weightStepGrams: 50 },
        SKU,
        NOT_USED,
      );
      expect(() => byWeight.changeMinQuantities("follow", OWNER)).toThrow(
        MinQuantityOnWeightSaleError,
      );
      expect(() => byWeight.changeMinQuantities({ pro: 6, public: null }, OWNER)).toThrow(
        MinQuantityOnWeightSaleError,
      );
      expect(byWeight.changeMinQuantities({ pro: null, public: null }, OWNER).sale.saleUnit).toBe(
        "weight",
      );
    });
  });

  it("devient le défaut : tarif et minimum suivis passent en propre avec ce qu'elle voyait", () => {
    const followed = aSale().alignPricing(true).changeMinQuantities("follow", OWNER).sale;
    const seen = {
      ...born(),
      priceCents: 900,
      weightGrams: 90,
      minQuantities: { pro: 4, public: null },
    };
    const promoted = followed.promote(seen);
    expect(promoted.fields).toMatchObject({
      priceCents: 900,
      weightGrams: 90,
      minQuantities: { pro: 4, public: null },
      followsPricing: false,
      minQuantityFollowsDefault: false,
    });
  });
});
