import type {
  OffCatalogArticleView,
  WorkstationProductView,
  WorkstationsPageView,
} from "@lfd/contracts";

import type { ProductionArticle } from "../../../channels/commerce/index.js";
import type { WorkstationListing } from "../../domain/ports/workstation-map.reader.js";

/** Un article commandé ces jours-ci, sous le nom que sa ligne portait. */
export interface OrderedArticle {
  readonly sku: string;
  readonly productName: string;
}

/**
 * **La page Postes** (`documentation/fournil/les-postes-du-fournil.md`, § 3.8) — une
 * fonction pure : les postes, puis chaque produit du miroir avec ses
 * déclinaisons, son rayon et son poste, dans l'ordre du catalogue.
 *
 * - un produit placé que le miroir ne porte plus (retiré) reste listé, sans
 *   rayon, pour qu'on puisse le remettre « à ranger » ;
 * - `ordered` : une de ses déclinaisons est commandée ces jours-ci ;
 * - un SKU commandé absent du miroir est « hors catalogue » : sans produit,
 *   il ne peut pas recevoir de poste.
 */
export function workstationsPageOf(
  listing: WorkstationListing,
  articles: readonly ProductionArticle[],
  ordered: readonly OrderedArticle[],
): WorkstationsPageView {
  const orderedSkus = new Set(ordered.map((article) => article.sku));
  const products = productsOf(listing, articles, orderedSkus);
  return {
    workstations: listing.workstations.map(({ id, name, position, trackingLevel }) => ({
      id,
      name,
      position,
      trackingLevel,
    })),
    products,
    offCatalog: offCatalogOf(articles, ordered),
    unplacedCount: products.filter((product) => product.workstationId === null).length,
  };
}

function productsOf(
  listing: WorkstationListing,
  articles: readonly ProductionArticle[],
  orderedSkus: ReadonlySet<string>,
): WorkstationProductView[] {
  const byProduct = new Map<string, ProductionArticle[]>();
  for (const article of articles) {
    byProduct.set(article.productSku, [...(byProduct.get(article.productSku) ?? []), article]);
  }
  const listed = [...byProduct].map(([productSku, variants]) =>
    productOf(productSku, variants, listing, orderedSkus),
  );
  const gone = [...listing.placements]
    .filter(([productSku]) => !byProduct.has(productSku))
    .map(([productSku, workstationId]) => ({
      productSku,
      productName: null,
      family: null,
      workstationId,
      position: listing.positions.get(productSku) ?? null,
      ordered: false,
      variants: [],
    }));
  return [...listed, ...gone];
}

function productOf(
  productSku: string,
  variants: readonly ProductionArticle[],
  listing: WorkstationListing,
  orderedSkus: ReadonlySet<string>,
): WorkstationProductView {
  const first = variants[0];
  return {
    productSku,
    productName: variants.find((variant) => variant.productName !== null)?.productName ?? null,
    family: first === undefined ? null : first.family,
    workstationId: listing.placements.get(productSku) ?? null,
    position: listing.positions.get(productSku) ?? null,
    ordered: variants.some((variant) => orderedSkus.has(variant.sku)),
    variants: variants.map(({ sku, variantName, sellable }) => ({ sku, variantName, sellable })),
  };
}

function offCatalogOf(
  articles: readonly ProductionArticle[],
  ordered: readonly OrderedArticle[],
): OffCatalogArticleView[] {
  const known = new Set(articles.map((article) => article.sku));
  const seen = new Set<string>();
  return ordered.flatMap((article) => {
    if (known.has(article.sku) || seen.has(article.sku)) {
      return [];
    }
    seen.add(article.sku);
    return [{ sku: article.sku, productName: article.productName }];
  });
}
