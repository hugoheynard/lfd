import {
  ArchivedProductNotPublishableError,
  ProductNotActivatableError,
} from "../../errors/product-errors.js";
import { Product, type ProductSnapshot } from "../product.js";
import type { VariantSnapshot } from "../variant.js";
import type { CompletenessRules } from "../../services/variant-completeness.js";

/** La composition ne cite rien : seul le jugement de complétude parle. */
const NO_CITED_ALLERGENS: readonly string[] = [];

/**
 * **Activer exige de quoi vendre** (lot 2b du plan
 * `plan-catalogue-synchronise-par-audience.md`) : au moins une déclinaison
 * complète — prix, allergènes, prix pro, un taux par contexte en service.
 * L'audience propre de la fiche est un réglage sans refus.
 */

const SHEET = { declared: ["gluten"], mayContain: [] };

function variant(over: Partial<VariantSnapshot> = {}): VariantSnapshot {
  return {
    id: "var_1",
    sku: "PAT-1",
    name: { fr: "Tarte" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 1_000,
    weightGrams: null,
    proPriceMillicents: 853_081,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: SHEET,
    nutrition: null,
    ...over,
  };
}

function product(over: Partial<ProductSnapshot> = {}): Product {
  return Product.reconstitute({
    id: "prd_1",
    sku: "PAT",
    name: { fr: "Tarte" },
    slug: { fr: "tarte" },
    kind: "daily",
    categoryId: "cat_1",
    status: "draft",
    variants: [variant()],
    vatByContext: {},
    operationOnly: false,
    requiresCold: false,
    audience: null,
    ...over,
  });
}

/** Les trois contextes en service du semis : un taux pour chacun. */
const ALL_RATES = { b2b: 20, takeaway: 5.5, eatIn: 10 };
const RULES: CompletenessRules = {
  activeContextKeys: ["b2b", "takeaway", "eatIn"],
};

describe("Product.activate — au moins une déclinaison complète (lot 2b)", () => {
  it("active une fiche tarifée, déclarée, taxée pour chaque contexte en service", () => {
    const tarte = product();

    expect(tarte.activate(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toBe(true);
    expect(tarte.status).toBe("published");
  });

  it("refuse sans prix, et dit où le saisir", () => {
    const tarte = product({ variants: [variant({ priceCents: null })] });

    expect(() => tarte.activate(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toThrow(
      ProductNotActivatableError,
    );
    expect(() => tarte.activate(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toThrow(/PAT-1.*Tarif/);
    expect(tarte.status).toBe("draft");
  });

  /**
   * Le prix se juge sur l'instantané RÉSOLU : une déclinaison alignée sur le
   * défaut porte le prix du défaut, même quand ce défaut est arrêté.
   */
  it("compte le prix hérité d'une déclinaison alignée sur le défaut", () => {
    const tarte = product({
      variants: [
        variant({ isDiscontinued: true }),
        variant({
          id: "var_2",
          sku: "PAT-2",
          isDefault: false,
          position: 1,
          priceCents: null,
          pricingFollowsDefault: true,
        }),
      ],
    });

    expect(tarte.activate(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toBe(true);
  });

  /**
   * 🔴 La règle tranchée par Hugo (2026-10-15) : un taux pour CHAQUE contexte
   * en service, quelle que soit l'audience — changer d'audience ne doit jamais
   * rendre une fiche invendable.
   */
  it("exige le taux d'un contexte en service même hors de l'audience, et le nomme", () => {
    const tarte = product({ audience: "pro" });

    expect(() => tarte.activate({ b2b: 20, takeaway: 5.5 }, RULES, NO_CITED_ALLERGENS)).toThrow(
      /eatIn/,
    );
  });

  it("n'exige pas le taux d'un contexte hors service", () => {
    const tarte = product();

    expect(
      tarte.activate({ b2b: 20 }, { ...RULES, activeContextKeys: ["b2b"] }, NO_CITED_ALLERGENS),
    ).toBe(true);
  });

  it("dit tous les manques d'un coup plutôt qu'un à la fois", () => {
    const tarte = product({ variants: [variant({ priceCents: null, allergenSheet: null })] });

    expect(() => tarte.activate({}, RULES, NO_CITED_ALLERGENS)).toThrow(
      /PAT-1.*prix.*allergènes.*takeaway/,
    );
  });

  it("refuse toujours une fiche archivée, avant tout le reste", () => {
    const tarte = product({ status: "archived", variants: [variant({ priceCents: null })] });

    expect(() => tarte.activate({}, RULES, NO_CITED_ALLERGENS)).toThrow(
      ArchivedProductNotPublishableError,
    );
  });

  it("une fiche déjà active ne re-vérifie rien", () => {
    const tarte = product({ status: "published", variants: [variant({ priceCents: null })] });

    expect(tarte.activate({}, RULES, NO_CITED_ALLERGENS)).toBe(false);
  });
});

describe("Product.changeAudience — un réglage sans refus", () => {
  it("naît en héritant de sa famille", () => {
    expect(product().audience).toBeNull();
  });

  it("pose, puis rend à la famille", () => {
    const tarte = product();

    expect(tarte.changeAudience("pro")).toBe(true);
    expect(tarte.persistenceSnapshot().audience).toBe("pro");
    expect(tarte.changeAudience(null)).toBe(true);
    expect(tarte.audience).toBeNull();
  });

  it("dit qu'il n'a rien fait quand l'audience était déjà celle-là", () => {
    expect(product({ audience: "public" }).changeAudience("public")).toBe(false);
  });

  it("se règle sur une fiche active comme sur une archivée", () => {
    expect(product({ status: "published" }).changeAudience("pro")).toBe(true);
    expect(product({ status: "archived" }).changeAudience("pro")).toBe(true);
  });

  it("survit à la reconstitution", () => {
    const tarte = product({ audience: "both" });

    expect(Product.reconstitute(tarte.persistenceSnapshot()).audience).toBe("both");
  });
});

/**
 * Le jugement sans effet que la liste lit (« Activables », 2026-10-26) : il
 * doit rendre exactement ce que `activate` refuse ou accepte.
 */
describe("Product.activationGapsWith / isActivatableWith — le jugement sans effet", () => {
  it("rend les manques que le refus d'activation porte, sans muter la fiche", () => {
    const tarte = product({ variants: [variant({ priceCents: null })] });

    const gaps = tarte.activationGapsWith(ALL_RATES, RULES, NO_CITED_ALLERGENS);

    expect(Object.keys(gaps.byVariant)).toEqual(["PAT-1"]);
    expect(tarte.isActivatableWith(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toBe(false);
    expect(tarte.status).toBe("draft");
    let refusal: unknown = null;
    try {
      tarte.activate(ALL_RATES, RULES, NO_CITED_ALLERGENS);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(ProductNotActivatableError);
    expect(refusal).toMatchObject({ gaps });
  });

  it("dit activable un brouillon complet, que l'activation accepte ensuite", () => {
    const tarte = product();

    expect(tarte.isActivatableWith(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toBe(true);
    expect(tarte.status).toBe("draft");
    expect(tarte.activate(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toBe(true);
  });

  it("dit non activable une fiche dont toutes les déclinaisons sont arrêtées", () => {
    const tarte = product({ variants: [variant({ isDiscontinued: true })] });

    expect(tarte.activationGapsWith(ALL_RATES, RULES, NO_CITED_ALLERGENS).allDiscontinued).toBe(
      true,
    );
    expect(tarte.isActivatableWith(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toBe(false);
  });

  it.each(["published", "archived"] as const)(
    "dit non activable une fiche %s, même complète",
    (status) => {
      expect(product({ status }).isActivatableWith(ALL_RATES, RULES, NO_CITED_ALLERGENS)).toBe(
        false,
      );
    },
  );
});
