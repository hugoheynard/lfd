import { NO_TRANSLATIONS } from "../../../catalog/domain/catalog-translations.js";
import { VIENNOISERIES } from "../../../catalog/domain/__tests__/families.fixture.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../../catalog/domain/ports/catalog.reader.js";
import {
  type ResupplyOnlyArticle,
  ResupplyOnlyArticlesReader,
} from "../../../catalog/domain/ports/resupply-only-articles.reader.js";
import { CatalogResupplyCatalogue, withinFamilies } from "../catalog-resupply-catalogue.js";

function item(sku: string, overrides: Partial<ResolvedCatalogItem> = {}): ResolvedCatalogItem {
  return {
    sku,
    productSku: "VIE-001",
    name: `Nom ${sku}`,
    unitPriceMillicents: 200_000,
    pimPriceMillicents: 200_000,
    vatRate: 5.5,
    categoryId: VIENNOISERIES.id,
    categoryName: VIENNOISERIES.name,
    audience: "both",
    reservation: "none",
    menu: "on",
    translations: {
      name: NO_TRANSLATIONS,
      note: NO_TRANSLATIONS,
      description: NO_TRANSLATIONS,
      categoryName: NO_TRANSLATIONS,
    },
    family: VIENNOISERIES,
    isDefault: false,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    minQuantities: { pro: null, public: null },
    isFeatured: false,
    allergens: null,
    shopAllergens: { codes: null, incomplete: false, precautionary: false, texts: null },
    orderTimeLimit: null,
    note: null,
    description: null,
    image: null,
    thumbnail: null,
    ...overrides,
  };
}

/** Le défaut d'une fiche, et une autre déclinaison en vente. */
const DEFAULT = item("VIE-001-1", { isDefault: true });
const TILED = item("VIE-002-2");

/** Le catalogue doublé : il ÉTEND le port, et sert les mêmes deux articles. */
class Catalog extends CatalogReader {
  constructor(private readonly items: readonly ResolvedCatalogItem[] = [DEFAULT, TILED]) {
    super();
  }

  listSellable(): Promise<ResolvedCatalogItem[]> {
    return Promise.resolve([...this.items]);
  }

  findByShopSku(shopSku: string): Promise<ResolvedCatalogItem | null> {
    return Promise.resolve(this.items.find((candidate) => candidate.sku === shopSku) ?? null);
  }

  listByShopSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.reject(new Error("lecture inattendue"));
  }
}

/** Le cookie des formules : réservé au réassort, rangé avec les viennoiseries. */
const FORMULA_COOKIE: ResupplyOnlyArticle = {
  sku: "VIE-009-1",
  name: "Cookie formule",
  categoryId: VIENNOISERIES.id,
  categoryName: VIENNOISERIES.name,
  family: { id: VIENNOISERIES.id, name: VIENNOISERIES.name, position: VIENNOISERIES.position },
  saleUnit: "piece",
};

class ResupplyOnly extends ResupplyOnlyArticlesReader {
  constructor(private readonly items: readonly ResupplyOnlyArticle[] = []) {
    super();
  }

  articles(): Promise<readonly ResupplyOnlyArticle[]> {
    return Promise.resolve(this.items);
  }

  article(sku: string): Promise<ResupplyOnlyArticle | null> {
    return Promise.resolve(this.items.find((candidate) => candidate.sku === sku) ?? null);
  }
}

describe("CatalogResupplyCatalogue — un seul critère, celui du rayon", () => {
  /**
   * Régression E4 (audit final, 2026-11-03) : la liste ne proposait que le
   * défaut, et la validation acceptait une déclinaison masquée au rayon.
   */
  it("propose toute déclinaison en vente, le défaut comme les autres", async () => {
    const articles = await new CatalogResupplyCatalogue(
      new Catalog(),
      new ResupplyOnly(),
    ).articles();

    expect(articles.map((article) => article.sku)).toEqual(["VIE-001-1", "VIE-002-2"]);
  });

  it("valide ce qu'elle propose, et refuse un article que le rayon ne vend pas", async () => {
    const catalogue = new CatalogResupplyCatalogue(new Catalog(), new ResupplyOnly());

    await expect(catalogue.article("VIE-002-2")).resolves.toMatchObject({ sku: "VIE-002-2" });
    await expect(catalogue.article("VIE-001-1")).resolves.toMatchObject({ sku: "VIE-001-1" });
    await expect(catalogue.article("VIE-001-3")).resolves.toBeNull();
  });
});

describe("CatalogResupplyCatalogue — les articles réservés au réassort", () => {
  it("propose le cookie des formules, qu'aucune vitrine ne sert, avec les viennoiseries", async () => {
    const catalogue = new CatalogResupplyCatalogue(
      new Catalog(),
      new ResupplyOnly([FORMULA_COOKIE]),
    );

    const articles = await catalogue.articles();

    expect(articles.map((article) => article.sku)).toEqual(["VIE-001-1", "VIE-002-2", "VIE-009-1"]);
  });

  it("le valide à l'ajout d'une ligne, et refuse toujours un SKU inconnu des deux", async () => {
    const catalogue = new CatalogResupplyCatalogue(
      new Catalog(),
      new ResupplyOnly([FORMULA_COOKIE]),
    );

    await expect(catalogue.article("VIE-009-1")).resolves.toEqual({
      ...FORMULA_COOKIE,
      internal: true,
    });
    await expect(catalogue.article("INCONNU-1")).resolves.toBeNull();
  });
});

describe("CatalogResupplyCatalogue — interne par provenance", () => {
  it("marque interne l'article du lecteur de réassort, jamais celui du catalogue publié", async () => {
    const catalogue = new CatalogResupplyCatalogue(
      new Catalog(),
      new ResupplyOnly([FORMULA_COOKIE]),
    );

    const articles = await catalogue.articles();

    expect(articles.map((article) => [article.sku, article.internal])).toEqual([
      ["VIE-001-1", false],
      ["VIE-002-2", false],
      ["VIE-009-1", true],
    ]);
    await expect(catalogue.article("VIE-001-1")).resolves.toMatchObject({ internal: false });
    await expect(catalogue.article("VIE-009-1")).resolves.toMatchObject({ internal: true });
  });
});

describe("CatalogResupplyCatalogue — la famille et sa lignée", () => {
  const FINE = {
    id: "fam-fine",
    name: "Viennoiserie fine",
    position: 3,
    slug: "fam-fine",
    path: ["fam-fine", VIENNOISERIES.id],
    ancestors: [
      {
        id: VIENNOISERIES.id,
        name: VIENNOISERIES.name,
        position: VIENNOISERIES.position,
        nameTranslations: NO_TRANSLATIONS,
      },
    ],
  };

  it("sert la famille avec ses parentes, réduites à ce qu'un rayon lit", async () => {
    const nested = item("VIE-010-1", {
      isDefault: true,
      categoryId: FINE.id,
      categoryName: FINE.name,
      family: FINE,
    });
    const catalogue = new CatalogResupplyCatalogue(new Catalog([nested]), new ResupplyOnly());

    const [article] = await catalogue.articles();

    expect(article?.categoryId).toBe(FINE.id);
    expect(article?.family).toEqual({
      id: FINE.id,
      name: FINE.name,
      position: FINE.position,
      root: { id: VIENNOISERIES.id, name: VIENNOISERIES.name, position: VIENNOISERIES.position },
      path: FINE.path,
      ancestors: [
        { id: VIENNOISERIES.id, name: VIENNOISERIES.name, position: VIENNOISERIES.position },
      ],
    });
  });

  it("ne sert aucune parente à une famille de tête", async () => {
    const [article] = await new CatalogResupplyCatalogue(
      new Catalog(),
      new ResupplyOnly(),
    ).articles();

    expect(article?.family).not.toHaveProperty("ancestors");
    expect(article?.family).toMatchObject({ id: VIENNOISERIES.id, name: VIENNOISERIES.name });
  });
});

describe("withinFamilies", () => {
  const COOKIE = { ...FORMULA_COOKIE, internal: true };
  const BREADS = {
    ...COOKIE,
    sku: "PAI-001-1",
    categoryId: "pains",
    categoryName: "Pains",
  };
  const shop = [
    { ...COOKIE, sku: "VIE-001-1", internal: false },
    { ...BREADS, sku: "PAI-002-1" },
  ];

  it("range un article après le dernier de sa famille", () => {
    expect(withinFamilies(shop, [COOKIE]).map((article) => article.sku)).toEqual([
      "VIE-001-1",
      "VIE-009-1",
      "PAI-002-1",
    ]);
  });

  it("met à la fin un article dont la famille n'a aucun article public", () => {
    const pastry = { ...COOKIE, sku: "PAT-001-1", categoryId: "patisseries" };

    expect(withinFamilies(shop, [pastry]).map((article) => article.sku)).toEqual([
      "VIE-001-1",
      "PAI-002-1",
      "PAT-001-1",
    ]);
  });
});
