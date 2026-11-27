import {
  awaitsReview,
  entryVariantsOf,
  itemsOnSale,
  reopenedReviewScope,
  reviewReopenedBy,
  type ReceivedCatalogItem,
  type ReceivedCatalogProduct,
} from "../catalog-product-facts.js";

/** Ce qui se vend d'une fiche reçue : ses déclinaisons complètes, si elle est active. */

const ITEM = { sku: "VIE-1-1" } as const;

function product(status: ReceivedCatalogProduct["status"]): ReceivedCatalogProduct {
  return {
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    categoryId: "cat_1",
    status,
    audience: "both",
    audienceInherited: true,
    gaps: {},
    seq: 1,
    receivedAt: new Date(0),
    items: [fact()],
  };
}

function fact(): ReceivedCatalogItem {
  return {
    variantId: "var_1",
    audience: "both",
    nameTranslations: null,
    noteTranslations: null,
    description: null,
    descriptionTranslations: null,
    sku: ITEM.sku,
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    kind: "daily",
    categoryId: "cat_1",
    priceMillicents: 100_000,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    publicTtcCents: 120,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    minQuantities: { pro: null, public: null },
    publicByContext: null,
    allergens: [],
    allergenLabels: null,
    mayContain: null,
    allergensPrecautionary: false,
    allergenTexts: null,
    orderTimeLimit: null,
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
    productName: null,
    receivedAt: new Date(0),
  };
}

describe("itemsOnSale", () => {
  it("vend les déclinaisons complètes d'une fiche active", () => {
    expect(itemsOnSale(product("active")).map((item) => item.sku)).toEqual([ITEM.sku]);
  });

  it.each(["inactive", "archived"] as const)("ne vend rien d'une fiche %s", (status) => {
    expect(itemsOnSale(product(status))).toEqual([]);
  });
});

/** Lot 3 : une ligne neuve n'attend la validation que des audiences qu'elle sert. */
describe("awaitsReview", () => {
  it("met en attente une ligne neuve pour chaque audience qu'elle contient, et elles seules", () => {
    expect(awaitsReview("both", "public")).toBe(true);
    expect(awaitsReview("both", "pro")).toBe(true);
    expect(awaitsReview("pro", "public")).toBe(false);
    expect(awaitsReview("public", "pro")).toBe(false);
  });
});

/**
 * Q1 de `plan-audience-par-declinaison.md` (Hugo, 2026-11-24) : l'attente se
 * repose quand l'audience d'un article s'élargit à une clientèle.
 */
describe("reviewReopenedBy", () => {
  it("rouvre l'attente publique quand l'audience s'élargit au public", () => {
    expect(reviewReopenedBy("pro", "both", "public")).toBe(true);
    expect(reviewReopenedBy("resupply", "public", "public")).toBe(true);
  });

  it("rouvre l'attente pro quand l'audience s'élargit aux pros", () => {
    expect(reviewReopenedBy("public", "both", "pro")).toBe(true);
    expect(reviewReopenedBy("resupply", "pro", "pro")).toBe(true);
  });

  it("ne rouvre rien quand la clientèle était déjà servie, ou n'est pas atteinte", () => {
    expect(reviewReopenedBy("both", "public", "public")).toBe(false);
    expect(reviewReopenedBy("public", "resupply", "public")).toBe(false);
    expect(reviewReopenedBy("pro", "pro", "public")).toBe(false);
    expect(reviewReopenedBy("pro", "public", "pro")).toBe(false);
  });

  it("une colonne vide se lit « les deux » : elle ne s'élargit jamais", () => {
    expect(reviewReopenedBy(null, "both", "public")).toBe(false);
  });
});

/** La même règle, dans la forme de l'écriture conditionnée que l'adaptateur pose. */
describe("reopenedReviewScope", () => {
  const items = [
    { ...fact(), sku: "A", audience: "both" as const },
    { ...fact(), sku: "B", audience: "resupply" as const },
    { ...fact(), sku: "C", audience: "public" as const },
  ];

  it("vise les articles qui servent désormais la clientèle, depuis les audiences qui ne la servaient pas", () => {
    expect(reopenedReviewScope(items, "public")).toEqual({
      skus: ["A", "C"],
      from: ["pro", "resupply"],
    });
    expect(reopenedReviewScope(items, "pro")).toEqual({
      skus: ["A"],
      from: ["public", "resupply"],
    });
  });
});

/** Lot 3 : ce que l'entrée de la fiche range de ses déclinaisons complètes. */
describe("entryVariantsOf", () => {
  it("garde le SKU, le nom, le défaut et les deux prix proposés", () => {
    const [variant] = entryVariantsOf(product("inactive"));
    expect(variant).toEqual({
      sku: ITEM.sku,
      name: "Croissant",
      isDefault: true,
      proHtMillicents: 100_000,
      publicTtcCents: 120,
      audience: "both",
    });
  });
});
