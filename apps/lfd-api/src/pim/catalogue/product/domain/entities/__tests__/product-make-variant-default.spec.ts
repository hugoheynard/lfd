import { bareVariant, tarte } from "../../../application/__tests__/audience-doubles.js";
import { VariantNotFoundError } from "../../errors/product-errors.js";
import { PricingAlignmentAcrossUnitsError } from "../../errors/sale-unit-errors.js";
import {
  DiscontinuedVariantNotDefaultableError,
  DormantSheetWouldWakeError,
  VariantAlreadyDefaultError,
} from "../../errors/variant-lifecycle-errors.js";
import { Product } from "../product.js";
import type { VariantSnapshot } from "../variant.js";

/**
 * **Changer la déclinaison par défaut** (`plan-gestes-de-declinaison.md`, G4) :
 * celles qui suivaient le défaut suivent la nouvelle ; la nouvelle reçoit en
 * propre ce qu'elle voyait ; l'ancienne garde ses valeurs.
 */

const OLD_ID = "prd_tarte_v1";
const NEW_ID = "prd_tarte_v2";
const SISTER_ID = "prd_tarte_v3";

const OLD_SHEET = { declared: ["gluten"], mayContain: ["eggs"] };
const OLD_NUTRITION = {
  energyKcal: 320,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  glycemicIndex: null,
};

function product(over: Partial<VariantSnapshot> = {}, sister: Partial<VariantSnapshot> = {}) {
  return Product.reconstitute(
    tarte({
      variants: [
        bareVariant({
          priceCents: 3_200,
          weightGrams: 900,
          proPriceMillicents: 2_730_331,
          minQuantities: { pro: 6, public: null },
          allergenSheet: OLD_SHEET,
          nutrition: OLD_NUTRITION,
        }),
        bareVariant({
          id: NEW_ID,
          sku: "PAT-7-2",
          name: { fr: "Six parts" },
          isDefault: false,
          position: 1,
          priceCents: 999,
          pricingFollowsDefault: true,
          regulatoryFollowsDefault: true,
          nutritionFollowsDefault: true,
          minQuantityFollowsDefault: true,
          ...over,
        }),
        bareVariant({
          id: SISTER_ID,
          sku: "PAT-7-3",
          isDefault: false,
          position: 2,
          priceCents: 500,
          pricingFollowsDefault: true,
          regulatoryFollowsDefault: true,
          ...sister,
        }),
      ],
    }),
  );
}

function resolved(subject: Product, id: string) {
  return subject.snapshot().variants.find((variant) => variant.id === id);
}

function stored(subject: Product, id: string) {
  return subject.persistenceSnapshot().variants.find((variant) => variant.id === id);
}

describe("Product.makeVariantDefault", () => {
  it("bascule le défaut : une seule déclinaison par défaut, la nouvelle", () => {
    const subject = product();

    const change = subject.makeVariantDefault(NEW_ID);

    expect(change.previousDefaultId).toBe(OLD_ID);
    const defaults = subject.snapshot().variants.filter((variant) => variant.isDefault);
    expect(defaults.map((variant) => variant.id)).toEqual([NEW_ID]);
  });

  it("donne en PROPRE à la nouvelle les valeurs qu'elle voyait, drapeaux remis à false", () => {
    const subject = product();

    const change = subject.makeVariantDefault(NEW_ID);

    expect(stored(subject, NEW_ID)).toMatchObject({
      priceCents: 3_200,
      weightGrams: 900,
      proPriceMillicents: 2_730_331,
      minQuantities: { pro: 6, public: null },
      allergenSheet: OLD_SHEET,
      nutrition: OLD_NUTRITION,
      pricingFollowsDefault: false,
      regulatoryFollowsDefault: false,
      nutritionFollowsDefault: false,
      minQuantityFollowsDefault: false,
    });
    expect(change.inherited).toEqual({ allergens: true, nutrition: true });
  });

  it("garde ce que la nouvelle ne suivait pas", () => {
    const subject = product({ pricingFollowsDefault: false, nutritionFollowsDefault: false });

    const change = subject.makeVariantDefault(NEW_ID);

    expect(stored(subject, NEW_ID)).toMatchObject({ priceCents: 999, nutrition: null });
    expect(change.inherited).toEqual({ allergens: true, nutrition: false });
  });

  it("les sœurs qui suivaient l'ancien défaut suivent la nouvelle", () => {
    const subject = product({ pricingFollowsDefault: false, priceCents: 999 });

    subject.makeVariantDefault(NEW_ID);

    // Le tarif vu par la sœur est celui de la nouvelle (999), plus 3 200.
    expect(resolved(subject, SISTER_ID)).toMatchObject({
      priceCents: 999,
      allergenSheet: OLD_SHEET,
      pricingFollowsDefault: true,
    });
    expect(stored(subject, SISTER_ID)?.priceCents).toBe(500);
  });

  it("l'ancien défaut garde ses valeurs propres et ne suit rien", () => {
    const subject = product();

    subject.makeVariantDefault(NEW_ID);

    expect(stored(subject, OLD_ID)).toMatchObject({
      isDefault: false,
      priceCents: 3_200,
      allergenSheet: OLD_SHEET,
      pricingFollowsDefault: false,
      regulatoryFollowsDefault: false,
      minQuantityFollowsDefault: false,
    });
  });

  it("refuse celle qui l'est déjà", () => {
    expect(() => product().makeVariantDefault(OLD_ID)).toThrow(VariantAlreadyDefaultError);
  });

  it("refuse une archivée, sans rien basculer", () => {
    const subject = product({ isDiscontinued: true });

    expect(() => subject.makeVariantDefault(NEW_ID)).toThrow(
      DiscontinuedVariantNotDefaultableError,
    );
    expect(resolved(subject, OLD_ID)?.isDefault).toBe(true);
  });

  it("refuse une déclinaison d'une autre fiche", () => {
    expect(() => product().makeVariantDefault("prd_ailleurs")).toThrow(VariantNotFoundError);
  });

  it("refuse de réveiller une ancienne déclaration quand le défaut n'en a aucune", () => {
    const subject = Product.reconstitute(
      tarte({
        variants: [
          bareVariant(),
          bareVariant({
            id: NEW_ID,
            sku: "PAT-7-2",
            isDefault: false,
            position: 1,
            regulatoryFollowsDefault: true,
            allergenSheet: OLD_SHEET,
          }),
        ],
      }),
    );

    expect(() => subject.makeVariantDefault(NEW_ID)).toThrow(DormantSheetWouldWakeError);
  });

  it("refuse qu'une sœur suive le tarif d'un défaut vendu dans une autre unité", () => {
    const subject = product({ pricingFollowsDefault: false, saleUnit: "weight" });

    expect(() => subject.makeVariantDefault(NEW_ID)).toThrow(PricingAlignmentAcrossUnitsError);
  });
});
