import type { OffCatalogArticleView, UnplacedProductOfDayView } from "@lfd/contracts";

import type { ProductionArticle } from "../../../channels/commerce/index.js";
import type { WorkstationsOfProducts } from "../../domain/ports/workstation-of-products.js";

/** Un article du jour, sous le nom que sa ligne ou sa demande portait. */
export interface DayArticle {
  readonly sku: string;
  readonly productName: string;
}

/** Les produits du jour sans poste, et les SKU que le commerce ne connaît plus. */
export interface UnplacedProducts {
  readonly products: readonly UnplacedProductOfDayView[];
  readonly offCatalog: readonly OffCatalogArticleView[];
}

/**
 * **Les produits du jour à ranger** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.10) — une fonction pure. Chaque SKU du jour est ramené à son produit ;
 * un produit sans poste, ou dont le poste n'est plus en service, est « à
 * ranger », avec les déclinaisons du jour qui le portent. Un produit qui a
 * au moins un poste en service est rangé, même si d'autres manquent. Un SKU absent du
 * miroir est hors catalogue : il ne peut pas recevoir de poste, et se compte à
 * part. Chaque produit et chaque SKU une fois, dans l'ordre des références.
 */
export function unplacedProductsOf(
  day: readonly DayArticle[],
  articles: ReadonlyMap<string, ProductionArticle>,
  placement: WorkstationsOfProducts,
): UnplacedProducts {
  const active = new Set(placement.workstations.map((station) => station.id));
  const products = new Map<string, { productName: string | null; skus: Set<string> }>();
  const offCatalog = new Map<string, OffCatalogArticleView>();
  for (const { sku, productName } of day) {
    const article = articles.get(sku);
    if (article === undefined) {
      offCatalog.set(sku, offCatalog.get(sku) ?? { sku, productName });
      continue;
    }
    const stations = placement.byProduct.get(article.productSku) ?? [];
    if (stations.some((station) => active.has(station.workstationId))) {
      continue;
    }
    const entry = products.get(article.productSku) ?? {
      productName: article.productName,
      skus: new Set<string>(),
    };
    entry.skus.add(sku);
    products.set(article.productSku, entry);
  }
  return {
    products: [...products.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([productSku, entry]) => ({
        productSku,
        productName: entry.productName,
        skus: [...entry.skus].sort(),
      })),
    offCatalog: [...offCatalog.values()].sort((left, right) => left.sku.localeCompare(right.sku)),
  };
}
