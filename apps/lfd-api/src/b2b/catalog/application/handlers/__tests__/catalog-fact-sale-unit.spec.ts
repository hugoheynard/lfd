import { CatalogProductChangedFact } from "../../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import { receivedProductOf } from "../catalog-fact-mapping.js";
import { CatalogFactPayloadError } from "../../../../../pim/channels/b2b-platform/products/catalog-category-changed.fact.js";

/**
 * **L'unité de vente dans le fait d'une fiche, côté commerce** (fil v14,
 * `documentation/pricing/vente-au-poids.md`, P2).
 *
 * Payloads écrits À LA MAIN, tels qu'ils dorment en boîte d'envoi : un fait
 * émis avant le lot ne porte pas l'unité, et il doit rester lisible — à la
 * pièce, ce qu'il était — sans quoi la livraison passerait en lettre morte au
 * déploiement.
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

describe("receivedProductOf — l'unité de vente", () => {
  it("range sur l'article l'unité, le pas et le minimum d'une déclinaison au poids", () => {
    const fact = CatalogProductChangedFact.fromPayload(
      payload({ variant: { saleUnit: "weight", weightMinGrams: 200, weightStepGrams: 50 } }),
    );

    expect(receivedProductOf(fact).items[0]).toMatchObject({
      saleUnit: "weight",
      weightMinGrams: 200,
      weightStepGrams: 50,
    });
  });

  it("garde une pièce à la pièce, sans pas ni minimum", () => {
    const fact = CatalogProductChangedFact.fromPayload(
      payload({ variant: { saleUnit: "piece", weightMinGrams: null, weightStepGrams: null } }),
    );

    expect(receivedProductOf(fact).items[0]).toMatchObject({
      saleUnit: "piece",
      weightMinGrams: null,
      weightStepGrams: null,
    });
  });

  /** Un fait d'avant la v14 : il n'existait que des pièces. */
  it("lit « à la pièce » un fait émis avant l'unité de vente", () => {
    const fact = CatalogProductChangedFact.fromPayload(payload({}));

    expect(receivedProductOf(fact).items[0]).toMatchObject({
      saleUnit: "piece",
      weightMinGrams: null,
      weightStepGrams: null,
    });
  });

  it("refuse une unité inconnue plutôt que de la lire à la pièce", () => {
    expect(() =>
      CatalogProductChangedFact.fromPayload(payload({ variant: { saleUnit: "kg" } })),
    ).toThrow(CatalogFactPayloadError);
  });
});

/** Fil v15 (`plan-quantite-minimale.md`, M2) : la grille effective, rangée telle quelle. */
describe("receivedProductOf — la quantité minimale", () => {
  it("range la grille reçue sur l'article", () => {
    const grid = { pro: { b2b: 6 }, public: { takeaway: 2 } };
    const fact = CatalogProductChangedFact.fromPayload(
      payload({ variant: { minQuantities: grid } }),
    );

    expect(receivedProductOf(fact).items[0]?.minQuantities).toEqual(grid);
  });

  /** Un fait d'avant la v15 : « on ne sait pas », jamais « aucun minimum ». */
  it("lit `null` sur un fait émis avant la quantité minimale", () => {
    const fact = CatalogProductChangedFact.fromPayload(payload({}));

    expect(receivedProductOf(fact).items[0]?.minQuantities).toBeNull();
  });

  it("refuse un minimum à 1 plutôt que de le ranger", () => {
    expect(() =>
      CatalogProductChangedFact.fromPayload(
        payload({ variant: { minQuantities: { pro: { b2b: 1 }, public: {} } } }),
      ),
    ).toThrow(CatalogFactPayloadError);
  });
});
