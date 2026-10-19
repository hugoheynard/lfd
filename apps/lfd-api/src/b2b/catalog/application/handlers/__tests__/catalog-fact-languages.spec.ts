import { CatalogCategoryChangedFact } from "../../../../../pim/channels/b2b-platform/products/catalog-category-changed.fact.js";
import { CatalogProductChangedFact } from "../../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import { receivedFamilyOf, receivedProductOf } from "../catalog-fact-mapping.js";

/**
 * **Les langues dans les faits du catalogue, côté commerce** (lot des
 * langues, 2026-10-18 — `documentation/webhooks/vitrine.md` §5).
 *
 * Les payloads sont écrits À LA MAIN, tels qu'ils dorment en boîte d'envoi :
 * un fait émis avant le lot ne porte aucune traduction, et il doit rester
 * lisible — sans quoi la livraison passerait en lettre morte au déploiement.
 */

const EMITTED = "2030-01-01T09:00:00.000Z";

const FAMILY = {
  id: "fam_1",
  name: "Viennoiseries",
  slug: "viennoiseries",
  parentId: null,
  position: 0,
  vatRatePercent: 5.5,
  audience: "both",
  archived: false,
};

const VARIANT = {
  id: "var_1",
  sku: "VIE-1-1",
  name: "Croissant",
  priceMillicents: 100_000,
  publicTtcCents: 120,
  publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 113_744 } },
  weightGrams: 60,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  allergens: ["UW"],
  allergenLabels: { labels: [{ category: "gluten", label: "Gluten" }], incomplete: false },
};

const PRODUCT = {
  id: "prd_1",
  sku: "VIE-1",
  name: "Croissant",
  categoryId: FAMILY.id,
  kind: "daily",
  note: "Tourage patient",
  image: null,
  thumbnail: null,
  operationOnly: false,
  requiresCold: false,
};

function payload(over: {
  readonly product?: Readonly<Record<string, unknown>>;
  readonly variant?: Readonly<Record<string, unknown>>;
  readonly family?: Readonly<Record<string, unknown>>;
}): Readonly<Record<string, unknown>> {
  return {
    productId: "prd_1",
    seq: 7,
    emittedAt: EMITTED,
    status: "active",
    audience: "both",
    audienceInherited: true,
    product: { ...PRODUCT, ...over.product },
    variants: [{ ...VARIANT, ...over.variant }],
    gaps: {},
    family: { ...FAMILY, ...over.family },
  };
}

describe("receivedProductOf — les langues", () => {
  it("range les traductions du nom de la déclinaison et de la ligne sur l'article", () => {
    const fact = CatalogProductChangedFact.fromPayload(
      payload({
        product: { noteTranslations: { it: "Sfogliatura paziente" } },
        variant: { nameTranslations: { en: "Butter croissant" } },
      }),
    );

    expect(receivedProductOf(fact).items[0]).toMatchObject({
      name: "Croissant",
      note: "Tourage patient",
      nameTranslations: { en: "Butter croissant" },
      noteTranslations: { it: "Sfogliatura paziente" },
    });
  });

  /** Un fait d'avant le lot : « on ne sait pas », pas « rien de traduit ». */
  it("lit `null` les traductions d'un fait émis avant elles", () => {
    const fact = CatalogProductChangedFact.fromPayload(payload({}));

    expect(receivedProductOf(fact).items[0]).toMatchObject({
      name: "Croissant",
      nameTranslations: null,
      noteTranslations: null,
    });
    expect(receivedFamilyOf(fact.body.family, new Date(EMITTED)).nameTranslations).toBeNull();
  });
});

describe("receivedFamilyOf — les langues", () => {
  it("range le nom traduit de la famille", () => {
    const fact = CatalogCategoryChangedFact.fromPayload({
      categoryId: FAMILY.id,
      seq: 12,
      emittedAt: EMITTED,
      family: { ...FAMILY, nameTranslations: { en: "Pastries", it: "Viennoiserie" } },
    });

    expect(receivedFamilyOf(fact.family, new Date(EMITTED))).toMatchObject({
      name: "Viennoiseries",
      nameTranslations: { en: "Pastries", it: "Viennoiserie" },
    });
  });
});
