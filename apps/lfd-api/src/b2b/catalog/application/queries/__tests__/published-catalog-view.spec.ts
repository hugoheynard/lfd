import type {
  PublishedCatalogSource,
  PublishedEntryRow,
  PublishedItemRow,
} from "../../../domain/ports/published-catalog.reader.js";
import { publishedCatalogViewOf } from "../published-catalog-view.js";

/**
 * La vue « Catalogue publié » (lot 3) composée sans base : une fiche inactive
 * et une fiche incomplète y paraissent, les comptes suivent les cellules, et
 * le callout ne liste que ce que le public pourrait voir. Les dates ne sont
 * comparées à aucune horloge.
 */

const RECEIVED = new Date("2026-10-01T08:00:00.000Z");

function entry(over: Partial<PublishedEntryRow>): PublishedEntryRow {
  return {
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    categoryId: "fam-feuillete",
    status: "active",
    audience: "both",
    audienceInherited: true,
    gaps: {},
    variants: [],
    receivedAt: RECEIVED,
    ...over,
  };
}

function item(over: Partial<PublishedItemRow>): PublishedItemRow {
  return {
    sku: "VIE-1-1",
    productId: "p1",
    productSku: "VIE-1",
    name: "Croissant",
    categoryId: "fam-feuillete",
    isDefault: true,
    position: 0,
    audience: "both",
    publicReviewPending: false,
    proReviewPending: false,
    isHidden: false,
    isHiddenPublic: false,
    proHtMillicents: 120_000,
    vatRatePercent: 5.5,
    publicTtcCents: 180,
    receivedAt: RECEIVED,
    ...over,
  };
}

const SOURCE: PublishedCatalogSource = {
  entries: [
    entry({
      variants: [
        {
          sku: "VIE-1-1",
          name: "Croissant",
          isDefault: true,
          proHtMillicents: 1,
          publicTtcCents: 1,
        },
      ],
    }),
    entry({
      productId: "p2",
      productSku: "VIE-2",
      name: "Brioche",
      status: "inactive",
      audienceInherited: false,
      variants: [
        {
          sku: "VIE-2-1",
          name: "Brioche",
          isDefault: true,
          proHtMillicents: 90_000,
          publicTtcCents: 150,
        },
      ],
      gaps: { "VIE-2-2": ["price"] },
    }),
    entry({
      productId: "p3",
      productSku: "PAI-1",
      name: "Baguette",
      categoryId: "fam-boulange",
      gaps: { "PAI-1-1": ["price", "allergens"] },
    }),
  ],
  items: [
    item({}),
    item({
      sku: "VIE-9-1",
      productId: "p9",
      productSku: "VIE-9",
      publicReviewPending: true,
      proReviewPending: true,
    }),
    item({
      sku: "VIE-8-1",
      productId: "p8",
      productSku: "VIE-8",
      audience: "pro",
      publicReviewPending: true,
    }),
  ],
  families: [
    { id: "fam-boulange", name: "Pains", position: 2, audience: "both", withdrawn: false },
    { id: "fam-feuillete", name: "Viennoiseries", position: 1, audience: "pro", withdrawn: false },
    { id: "fam-sans-fiche", name: "Vide", position: 3, audience: "both", withdrawn: false },
  ],
};

describe("publishedCatalogViewOf", () => {
  const view = publishedCatalogViewOf(SOURCE);

  it("rend les fiches, inactive, incomplète et connues du seul push comprises, rayon par rayon", () => {
    expect(view.entries.map((e) => [e.productSku, e.status])).toEqual([
      ["VIE-1", "active"],
      ["VIE-2", "inactive"],
      ["VIE-9", "active"],
      ["VIE-8", "active"],
      ["PAI-1", "active"],
    ]);
  });

  it("rend une déclinaison en vente avec ses deux prix servis, et l'audience de la famille à côté", () => {
    const croissant = view.entries[0];
    expect(croissant?.familyAudience).toBe("pro");
    expect(croissant?.variants).toEqual([
      {
        sku: "VIE-1-1",
        name: "Croissant",
        onSale: true,
        isDefault: true,
        gaps: [],
        reviewPending: { pro: false, public: false },
        pro: { state: "en_vente", htMillicents: 120_000 },
        public: { state: "en_vente", ttcCents: 180 },
      },
    ]);
  });

  it("rend une déclinaison incomplète par son SKU et ses manques", () => {
    expect(view.entries.find((e) => e.productSku === "PAI-1")?.variants).toEqual([
      {
        sku: "PAI-1-1",
        name: null,
        onSale: false,
        isDefault: false,
        gaps: ["price", "allergens"],
        reviewPending: { pro: false, public: false },
        pro: { state: "incomplet", htMillicents: null },
        public: { state: "incomplet", ttcCents: null },
      },
    ]);
  });

  it("compte par audience et par rayon, et garde le rayon sans fiche", () => {
    const pain = view.shelves.find((shelf) => shelf.categoryId === "fam-boulange");
    expect(pain?.pro).toEqual({
      inactif: 0,
      en_vente: 0,
      masque: 0,
      pas_vendu: 0,
      en_attente_validation: 0,
      incomplet: 1,
    });
    expect(view.shelves.map((shelf) => shelf.categoryId)).toEqual([
      "fam-boulange",
      "fam-feuillete",
      "fam-sans-fiche",
    ]);
  });

  it("montre les déclinaisons d'une fiche inactive, aux prix proposés, puis ses incomplètes", () => {
    const brioche = view.entries.find((e) => e.productSku === "VIE-2");
    expect(brioche?.audienceInherited).toBe(false);
    expect(
      brioche?.variants.map((v) => [v.sku, v.onSale, v.pro.state, v.pro.htMillicents]),
    ).toEqual([
      ["VIE-2-1", false, "inactif", 90_000],
      ["VIE-2-2", false, "inactif", null],
    ]);
    expect(brioche?.variants[0]?.public).toEqual({ state: "inactif", ttcCents: 150 });
  });

  it("ne montre jamais deux fois une déclinaison en vente que le fait porte aussi", () => {
    expect(view.entries[0]?.variants.map((v) => v.sku)).toEqual(["VIE-1-1"]);
    expect(view.entries[0]?.audienceInherited).toBe(true);
  });

  it("liste au callout chaque article en attente, avec les seules audiences qu'il sert", () => {
    expect(view.pendingReview.map((pending) => [pending.sku, pending.audiences])).toEqual([
      ["VIE-9-1", ["pro", "public"]],
    ]);
  });

  /** Faits fermés (avant 2b4) : le catalogue du push seul doit paraître, sans doublon. */
  it("rend en entrée synthétique une fiche connue du seul push, et une entrée reçue prime", () => {
    const pushed = view.entries.find((e) => e.productId === "p9");
    expect(pushed).toMatchObject({
      productSku: "VIE-9",
      status: "active",
      audience: "both",
      audienceInherited: null,
      familyAudience: "pro",
    });
    expect(pushed?.variants.map((v) => [v.sku, v.onSale])).toEqual([["VIE-9-1", true]]);
    const skus = view.entries.flatMap((e) => e.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
  });

  /** `plan-prix-manquant-non-bloquant.md` (2026-10-27) : vendue au public seul. */
  it("dit incomplète côté pro une déclinaison sans prix pro, en vente côté public", () => {
    const half = publishedCatalogViewOf({
      ...SOURCE,
      items: [item({ proHtMillicents: null })],
    });
    const variant = half.entries
      .find((e) => e.productSku === "VIE-1")
      ?.variants.find((v) => v.sku === "VIE-1-1");

    expect(variant?.pro).toEqual({ state: "incomplet", htMillicents: null });
    expect(variant?.public).toEqual({ state: "en_vente", ttcCents: 180 });
  });
});
