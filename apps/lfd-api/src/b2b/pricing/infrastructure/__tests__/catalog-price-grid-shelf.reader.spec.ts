import { CatalogViewers } from "../../../catalog/application/catalog-viewers.service.js";
import { GivenPricesPerKg } from "../../../catalog/application/__tests__/price-per-kg-doubles.js";
import {
  catalogItem,
  InMemoryCatalogOperations,
} from "../../../catalog/application/__tests__/sale-operations-doubles.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../../catalog/domain/ports/catalog.reader.js";
import type { CatalogViewer } from "../../../catalog/domain/catalog-viewer.js";
import { CatalogBackedProductCatalog } from "../../../catalog/infrastructure/catalog-backed-product-catalog.js";
import { shopSkuOf } from "../../../catalog/domain/shop-sku.js";
import { InMemoryServedCompanies } from "../../../catalog/infrastructure/in-memory-served-companies.js";
import { CatalogPriceGridServingReader } from "../catalog-price-grid-serving.reader.js";
import { CatalogPriceGridShelfReader } from "../catalog-price-grid-shelf.reader.js";

/**
 * **Le rayon d'un public pour la grille** — composé comme la vitrine : une
 * ligne par déclinaison montrée, le sceau du catalogue, le prix au kilo lu à
 * côté. Dates comparées à aucune horloge.
 */

const AT = new Date("2030-01-15T00:00:00.000Z");

class RecordingCatalog extends CatalogReader {
  readonly viewers: CatalogViewer[] = [];

  listSellable(viewer: CatalogViewer): Promise<ResolvedCatalogItem[]> {
    this.viewers.push(viewer);
    return Promise.resolve(ITEMS);
  }
  findByShopSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.resolve(null);
  }
  listByShopSkus(skus: readonly string[]): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.resolve(
      new Map(
        ITEMS.filter((item) => skus.includes(shopSkuOf(item))).map((item) => [
          shopSkuOf(item),
          item,
        ]),
      ),
    );
  }
}

const ITEMS: ResolvedCatalogItem[] = [
  catalogItem("VIE-001", { productName: "Croissant", name: "Croissant pur beurre" }),
  catalogItem("PAI-001", { isDefault: false, variantsAsTiles: false }),
];

function reader(catalog: CatalogReader = new RecordingCatalog()): CatalogPriceGridShelfReader {
  return new CatalogPriceGridShelfReader(
    new CatalogViewers(new InMemoryServedCompanies(new Map([["co_suspendue", "suspended"]]))),
    catalog,
    new InMemoryCatalogOperations(),
    new GivenPricesPerKg(
      new Map([["VIE-001-1", { proPricePerKgMillicents: 900_000, publicPricePerKgTtcCents: 990 }]]),
    ),
    new CatalogBackedProductCatalog(catalog),
  );
}

describe("le rayon d'un public pour la grille de prix", () => {
  it("un particulier : TTC, sans société ; seules les déclinaisons montrées", async () => {
    const shelf = await reader().shelfFor(null, AT);

    expect(shelf.basis).toBe("ttc");
    expect(shelf.pricingCompanyId).toBeNull();
    expect(shelf.articles.map((entry) => entry.article.sku)).toEqual(["VIE-001-1"]);
    expect(shelf.articles[0]).toMatchObject({
      familyName: "Pâtisseries",
      productName: "Croissant",
      vatRate: 5.5,
      enteredPerKg: { proHtMillicents: 900_000, publicTtcCents: 990 },
    });
    expect(shelf.articles[0]?.article.name).toBe("Croissant pur beurre");
  });

  it("une société active : HT, et son tarif ; une suspendue est servie au public", async () => {
    const pro = await reader().shelfFor("co_folie", AT);
    const suspended = await reader().shelfFor("co_suspendue", AT);

    expect(pro).toMatchObject({ basis: "ht", pricingCompanyId: "co_folie" });
    expect(suspended).toMatchObject({ basis: "ttc", pricingCompanyId: null });
  });

  it("le service se décide comme la vitrine, sans lire le rayon", async () => {
    const serving = new CatalogPriceGridServingReader(
      new CatalogViewers(new InMemoryServedCompanies()),
    );

    expect(await serving.servingOf("co_folie")).toEqual({
      basis: "ht",
      pricingCompanyId: "co_folie",
    });
    expect(await serving.servingOf(null)).toEqual({ basis: "ttc", pricingCompanyId: null });
  });
});
