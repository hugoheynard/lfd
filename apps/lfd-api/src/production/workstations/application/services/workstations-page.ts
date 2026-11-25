import type {
  OffCatalogArticleView,
  WorkstationProductStationView,
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
 * déclinaisons, son rayon et ses postes, dans l'ordre du catalogue.
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
  const gone = [...listing.placements.keys()]
    .filter((productSku) => !byProduct.has(productSku))
    .map((productSku) => ({
      productSku,
      productName: null,
      family: null,
      ...stationsOf(productSku, listing),
      ordered: false,
      variants: [],
    }));
  return [...listed, ...gone];
}

/**
 * Les postes d'un produit : celui qui finit en premier, puis dans l'ordre des
 * fiches. `workstationId` et `position` disent celui qui finit — le contrat
 * qu'un écran à un seul poste lit encore.
 */
function stationsOf(
  productSku: string,
  listing: WorkstationListing,
): Pick<WorkstationProductView, "workstationId" | "position" | "workstations"> {
  const rank = new Map(listing.workstations.map((station, index) => [station.id, index]));
  const workstations: WorkstationProductStationView[] = [
    ...(listing.placements.get(productSku) ?? []),
  ]
    .sort(
      (left, right) =>
        Number(right.finishes) - Number(left.finishes) ||
        (rank.get(left.workstationId) ?? rank.size) - (rank.get(right.workstationId) ?? rank.size),
    )
    .map(({ workstationId, finishes, position }) => ({ workstationId, finishes, position }));
  const finisher = workstations.find((station) => station.finishes) ?? null;
  return {
    workstationId: finisher?.workstationId ?? null,
    position: finisher?.position ?? null,
    workstations,
  };
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
    ...stationsOf(productSku, listing),
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
