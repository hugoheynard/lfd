import { NO_TRANSLATIONS } from "../../../catalog/domain/catalog-translations.js";
import { VIENNOISERIES } from "../../../catalog/domain/__tests__/families.fixture.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../../catalog/domain/ports/catalog.reader.js";
import { CatalogResupplyCatalogue } from "../catalog-resupply-catalogue.js";

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
    translations: { name: NO_TRANSLATIONS, note: NO_TRANSLATIONS, categoryName: NO_TRANSLATIONS },
    family: VIENNOISERIES,
    isDefault: false,
    variantsAsTiles: false,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    minQuantities: { pro: null, public: null },
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

/** Le défaut, une déclinaison en vignette, une déclinaison masquée au rayon. */
const DEFAULT = item("VIE-001-1", { isDefault: true });
const TILED = item("VIE-002-2", { variantsAsTiles: true });
const HIDDEN = item("VIE-001-3");

/** Le catalogue doublé : il ÉTEND le port, et sert les mêmes trois articles. */
class Catalog extends CatalogReader {
  private readonly items = [DEFAULT, TILED, HIDDEN];

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

describe("CatalogResupplyCatalogue — un seul critère, celui du rayon", () => {
  /**
   * Régression E4 (audit final, 2026-11-03) : la liste ne proposait que le
   * défaut, et la validation acceptait une déclinaison masquée au rayon.
   */
  it("propose le défaut et la déclinaison en vignette, jamais la masquée", async () => {
    const articles = await new CatalogResupplyCatalogue(new Catalog()).articles();

    expect(articles.map((article) => article.sku)).toEqual(["VIE-001-1", "VIE-002-2"]);
  });

  it("valide ce qu'elle propose, et refuse la déclinaison masquée comme un article inconnu", async () => {
    const catalogue = new CatalogResupplyCatalogue(new Catalog());

    await expect(catalogue.article("VIE-002-2")).resolves.toMatchObject({ sku: "VIE-002-2" });
    await expect(catalogue.article("VIE-001-1")).resolves.toMatchObject({ sku: "VIE-001-1" });
    await expect(catalogue.article("VIE-001-3")).resolves.toBeNull();
  });
});
