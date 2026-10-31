import { Injectable } from "@nestjs/common";

import { CatalogViewers } from "../../catalog/application/catalog-viewers.service.js";
import { shopCatalogueOf, shownByShopSku } from "../../catalog/application/shop-catalogue-view.js";
import { shownVariantSkus } from "../../catalog/application/shop-catalogue-price-per-kg.js";
import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import { pricingCompanyOf, viewerAudience } from "../../catalog/domain/catalog-viewer.js";
import { CatalogOperationsReader } from "../../catalog/domain/ports/catalog-operations.reader.js";
import {
  CatalogPricePerKgReader,
  type CatalogPricePerKg,
} from "../../catalog/domain/ports/catalog-price-per-kg.reader.js";
import { CatalogReader } from "../../catalog/domain/ports/catalog.reader.js";
import {
  PriceGridShelfReader,
  type PriceGridShelf,
  type PriceGridShelfArticle,
} from "../domain/ports/price-grid-shelf.reader.js";

const NOT_ENTERED: CatalogPricePerKg = {
  proPricePerKgMillicents: null,
  publicPricePerKgTtcCents: null,
};

/**
 * Le rayon d'un public, **composé comme la vitrine** : le lecteur de la société
 * (`CatalogViewers.forCompany`, qui décide pro ou public), la même définition
 * de « ce que la vitrine montre » (`shopCatalogueOf`, opérations datées jugées
 * à `at`), le même sceau d'article. Les articles réservés à un autre compte
 * n'y sont pas : la grille liste ce qui se vend à ce public.
 *
 * Le prix au kilo est lu À CÔTÉ (`plan-prix-au-kilo.md`, K3), jamais par la
 * résolution.
 */
@Injectable()
export class CatalogPriceGridShelfReader extends PriceGridShelfReader {
  constructor(
    private readonly viewers: CatalogViewers,
    private readonly catalog: CatalogReader,
    private readonly operations: CatalogOperationsReader,
    private readonly pricesPerKg: CatalogPricePerKgReader,
    private readonly products: ProductCatalogReader,
  ) {
    super();
  }

  async shelfFor(companyId: string | null, at: Date): Promise<PriceGridShelf> {
    const viewer = await this.viewers.forCompany(companyId, "served");
    const audience = viewerAudience(viewer);
    const [sellable, operations, operationOnlySkus] = await Promise.all([
      this.catalog.listSellable(viewer),
      this.operations.sellableOperations(),
      this.operations.operationOnlySkus(),
    ]);
    const shown = shopCatalogueOf(sellable, { operations, operationOnlySkus, audience, now: at });
    // Le sceau se LIT au catalogue (`lint:catalogue-authority`), par le chemin
    // même de la caisse, au lecteur de ce public.
    const [perKg, sealed] = await Promise.all([
      this.pricesPerKg.bySkus(shownVariantSkus(shown, sellable)),
      this.products.resolveMany(
        shown.items.map((item) => item.sku),
        viewer,
      ),
    ]);
    const byShopSku = shownByShopSku(sellable);
    const articles = shown.items.flatMap((item): PriceGridShelfArticle[] => {
      const source = byShopSku.get(item.sku);
      const article = sealed.get(item.sku)?.article;
      if (source === undefined || article === undefined) {
        return [];
      }
      const entered = perKg.get(source.sku) ?? NOT_ENTERED;
      return [
        {
          article,
          familyName: source.family.name,
          productName: source.productName ?? null,
          vatRate: source.vatRate,
          enteredPerKg: {
            proHtMillicents: entered.proPricePerKgMillicents,
            publicTtcCents: entered.publicPricePerKgTtcCents,
          },
        },
      ];
    });
    return {
      basis: audience === "pro" ? "ht" : "ttc",
      pricingCompanyId: pricingCompanyOf(viewer),
      articles,
    };
  }
}
