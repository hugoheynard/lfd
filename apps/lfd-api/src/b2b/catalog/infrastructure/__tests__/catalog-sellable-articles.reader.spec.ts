import { NO_TRANSLATIONS } from "../../domain/catalog-translations.js";
import type { CatalogFamily } from "../../domain/catalog-family.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../../domain/ports/catalog.reader.js";
import { PAINS, VIENNOISERIES } from "../../domain/__tests__/families.fixture.js";
import { CatalogSellableArticlesReader } from "../catalog-sellable-articles.reader.js";

/**
 * **Les articles vendables des raccourcis du fournil** : les deux audiences,
 * chaque produit une fois sous son SKU produit, dans l'ordre du catalogue.
 */

function item(
  productSku: string,
  of: CatalogFamily,
  overrides: Partial<ResolvedCatalogItem> = {},
): ResolvedCatalogItem {
  return {
    sku: `${productSku}-1`,
    productSku,
    name: `Nom ${productSku}`,
    unitPriceMillicents: 200_000,
    pimPriceMillicents: 200_000,
    vatRate: 5.5,
    categoryId: of.id,
    categoryName: of.name,
    audience: "both",
    translations: { name: NO_TRANSLATIONS, note: NO_TRANSLATIONS, categoryName: NO_TRANSLATIONS },
    family: of,
    isDefault: true,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    isFeatured: false,
    allergens: null,
    shopAllergens: { codes: null, incomplete: false, precautionary: false, texts: null },
    orderTimeLimit: null,
    note: null,
    image: null,
    thumbnail: null,
    ...overrides,
  };
}

/** Le catalogue doublé : il ÉTEND le port, et ne sert que la liste vendable. */
class Catalog extends CatalogReader {
  constructor(private readonly byAudience: Readonly<Record<ShopAudience, ResolvedCatalogItem[]>>) {
    super();
  }

  findSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listSellable(audience: ShopAudience): Promise<ResolvedCatalogItem[]> {
    return Promise.resolve(this.byAudience[audience]);
  }

  findDefaultByProductSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listDefaultsByProductSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.reject(new Error("lecture inattendue"));
  }
}

describe("CatalogSellableArticlesReader", () => {
  it("réunit les deux audiences, chaque produit une fois, par famille puis ordre lu", async () => {
    const catalog = new Catalog({
      pro: [item("VIE-002", VIENNOISERIES), item("PAI-001", PAINS), item("VIE-001", VIENNOISERIES)],
      public: [item("VIE-001", VIENNOISERIES), item("VIE-009", VIENNOISERIES)],
    });

    const articles = await new CatalogSellableArticlesReader(catalog).sellableArticles();

    expect(articles.map((article) => article.sku)).toEqual([
      "VIE-002",
      "VIE-001",
      "VIE-009",
      "PAI-001",
    ]);
    expect(articles[0]).toEqual({
      sku: "VIE-002",
      name: "Nom VIE-002",
      familyId: "fam-vien",
      familyName: "Viennoiseries",
      saleUnit: "piece",
    });
  });

  it("dit l'unité de l'article : au poids, le fournil règle ses raccourcis en grammes (P6)", async () => {
    const catalog = new Catalog({
      pro: [item("SAU-001", VIENNOISERIES, { saleUnit: "weight", weightStepGrams: 50 })],
      public: [item("VIE-001", VIENNOISERIES)],
    });

    const articles = await new CatalogSellableArticlesReader(catalog).sellableArticles();

    expect(articles.map((article) => [article.sku, article.saleUnit])).toEqual([
      ["SAU-001", "weight"],
      ["VIE-001", "piece"],
    ]);
  });

  it("ne garde que l'unité par défaut — le carton n'est pas une ligne de plus", async () => {
    const catalog = new Catalog({
      pro: [item("VIE-001", VIENNOISERIES, { sku: "VIE-001-2", isDefault: false })],
      public: [],
    });

    expect(await new CatalogSellableArticlesReader(catalog).sellableArticles()).toEqual([]);
  });
});
