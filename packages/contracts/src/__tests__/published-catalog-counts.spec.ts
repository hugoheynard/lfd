import type { PublishedEntryView, PublishedVariantView } from "../published-catalog.js";
import {
  type PendingReviewCandidate,
  pendingReviewOf,
  publishedShelvesOf,
} from "../published-catalog-counts.js";

/**
 * L'arithmétique de l'écran Catalogue que le serveur et l'écran partagent
 * (`le-cache-du-back-office.md`, § 4.2). Les dates ne sont comparées à
 * aucune horloge.
 */

const RECEIVED = "2026-10-01T08:00:00.000Z";

function variant(
  pro: PublishedVariantView["pro"]["state"],
  pub: PublishedVariantView["public"]["state"],
): PublishedVariantView {
  return {
    sku: `${pro}-${pub}`,
    name: "Croissant",
    onSale: true,
    isDefault: false,
    saleUnit: "piece",
    gaps: [],
    reviewPending: { pro: false, public: false },
    pro: { state: pro, htMillicents: 1 },
    public: { state: pub, ttcCents: 1 },
  };
}

function entry(categoryId: string, variants: readonly PublishedVariantView[]): PublishedEntryView {
  return {
    productId: `p-${categoryId}`,
    productSku: "VIE-1",
    name: "Croissant",
    categoryId,
    categoryPath: [categoryId],
    status: "active",
    audience: "both",
    audienceInherited: true,
    familyAudience: null,
    variants,
    receivedAt: RECEIVED,
  };
}

function candidate(over: Partial<PendingReviewCandidate>): PendingReviewCandidate {
  return {
    sku: "VIE-1-1",
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    categoryId: "fam",
    audience: null,
    proReviewPending: false,
    publicReviewPending: false,
    receivedAt: RECEIVED,
    ...over,
  };
}

describe("publishedShelvesOf", () => {
  it("compte chaque déclinaison par état et par audience, rayon par rayon", () => {
    const shelves = publishedShelvesOf(
      [{ categoryId: "fam", name: "Viennoiseries", position: 1, withdrawn: false }],
      [entry("fam", [variant("en_vente", "masque"), variant("en_vente", "incomplet")])],
    );

    expect(shelves).toHaveLength(1);
    expect(shelves[0]?.pro).toMatchObject({ en_vente: 2, masque: 0 });
    expect(shelves[0]?.public).toMatchObject({ masque: 1, incomplet: 1, en_vente: 0 });
  });

  it("garde un rayon connu sans fiche, tout à zéro, et range après lui une famille inconnue", () => {
    const shelves = publishedShelvesOf(
      [{ categoryId: "vide", name: "Pains", position: 2, withdrawn: true }],
      [entry("inconnue", [variant("pas_vendu", "en_vente")])],
    );

    expect(shelves.map((shelf) => [shelf.categoryId, shelf.name, shelf.withdrawn])).toEqual([
      ["vide", "Pains", true],
      ["inconnue", null, false],
    ]);
    expect(Object.values(shelves[0]?.pro ?? {}).every((count) => count === 0)).toBe(true);
    expect(shelves[1]?.position).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("pendingReviewOf", () => {
  it("ne liste que les audiences attendues ET que l'audience de l'article contient", () => {
    const pending = pendingReviewOf([
      candidate({ sku: "a", proReviewPending: true, publicReviewPending: true }),
      candidate({ sku: "b", audience: "pro", publicReviewPending: true }),
      candidate({
        sku: "c",
        audience: "public",
        proReviewPending: true,
        publicReviewPending: true,
      }),
      candidate({ sku: "d" }),
    ]);

    expect(pending.map((one) => [one.sku, one.audiences])).toEqual([
      ["a", ["pro", "public"]],
      ["c", ["public"]],
    ]);
    expect(pending[0]).toEqual({
      sku: "a",
      productId: "p1",
      productSku: "VIE-1",
      name: "Croissant",
      categoryId: "fam",
      audiences: ["pro", "public"],
      receivedAt: RECEIVED,
    });
  });
});
