import { searchProducts, type ProductSearchKeys } from '@lfd/b2b-ui/search';
import type {
  CatalogFamilyView,
  OrderSaleUnit,
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyTarget,
  SiteResupplyDraftView,
  StockAlertLevel,
  UnorderedReceiptLineView,
} from '@lfd/contracts';

import { onShelf } from '../resupply-shelves/resupply-shelves';

/** L'état d'une ligne : `ok` n'est pas une alerte, c'est l'absence d'alerte. */
export type RowState = 'ok' | StockAlertLevel;

/** Une ligne de la table du réassort : un produit, son stock, son état et sa demande. */
export interface StockRow {
  readonly sku: string;
  readonly name: string;
  /** La famille de l'article ; `null` pour un article reçu puis retiré du catalogue. */
  readonly categoryId: string | null;
  /**
   * La famille de l'article et ses parentes, pour le rail des rayons ;
   * `null` pour un article reçu puis retiré du catalogue — le reçu ne porte
   * pas sa famille, la ligne va sous « famille inconnue ».
   */
  readonly family: CatalogFamilyView | null;
  /**
   * L'unité de l'article : au poids, le stock, la demande et le reçu sans
   * commande comptent des GRAMMES, saisis en grammes et dits « 1,25 kg »
   * (lot L2b-4).
   */
  readonly saleUnit: OrderSaleUnit;
  /**
   * Réservé au réassort, jamais vendu en ligne : badge « Interne ». `false`
   * pour un article reçu puis retiré du catalogue — on n'en sait plus rien.
   */
  readonly internal: boolean;
  readonly stock: number;
  readonly state: RowState;
  readonly asap: number;
  readonly tomorrow: number;
  /** Le reçu sans commande de l'article ; `null` s'il n'y en a pas. */
  readonly unordered: number | null;
}

/** Les libellés des deux visées, sur le sélecteur et le bouton d'envoi. */
export const TARGET_LABELS: Readonly<Record<ResupplyTarget, string>> = {
  asap: 'Au plus tôt',
  tomorrow: 'Pour demain',
};

/** Ce que la table croise pour bâtir ses lignes. */
export interface StockRowSources {
  readonly articles: readonly ResupplyArticleView[];
  readonly stock: readonly ResupplyReceiptLineView[];
  readonly unordered: readonly UnorderedReceiptLineView[];
  readonly alertLevels: ReadonlyMap<string, StockAlertLevel>;
  readonly asapDraft: SiteResupplyDraftView | null;
  readonly tomorrowDraft: SiteResupplyDraftView | null;
}

/**
 * Les lignes de la table : ruptures et stocks faibles en tête, puis les
 * demandés, puis le reste — chaque groupe dans l'ordre du catalogue.
 * Un article reçu puis retiré du catalogue reste sur la table : il est en vitrine.
 */
export function buildStockRows(sources: StockRowSources): readonly StockRow[] {
  // Par (article, unité) : des pièces et des grammes ne s'additionnent jamais (L2b-1).
  const stock = new Map(sources.stock.map((line) => [unitKey(line), line] as const));
  const unordered = new Map(sources.unordered.map((line) => [unitKey(line), line] as const));
  const asap = draftQuantities(sources.asapDraft);
  const tomorrow = draftQuantities(sources.tomorrowDraft);
  const rows = productsOf(sources).map((product): StockRow => ({
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    family: product.family,
    saleUnit: product.saleUnit,
    internal: product.internal,
    stock: stock.get(unitKey(product))?.estimatedStock ?? 0,
    state: sources.alertLevels.get(product.sku) ?? 'ok',
    asap: asap.get(product.sku) ?? 0,
    tomorrow: tomorrow.get(product.sku) ?? 0,
    unordered: unordered.get(unitKey(product))?.receivedQuantity ?? null,
  }));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rankOf(a.row) - rankOf(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

const STOCK_ROW_SEARCH: ProductSearchKeys<StockRow> = {
  nameOf: (row) => row.name,
  skuOf: (row) => row.sku,
};

/**
 * Le rayon puis la recherche : une ligne passe les deux filtres. Le rayon
 * choisi montre son sous-arbre ; la recherche est celle de tous les écrans de
 * produits (`searchProducts`) : tolérante aux fautes, et elle range les plus
 * proches en tête.
 */
export function filterStockRows(
  rows: readonly StockRow[],
  query: string,
  shelf: string,
): readonly StockRow[] {
  return searchProducts(onShelf(rows, shelf), query, STOCK_ROW_SEARCH);
}

/** Le libellé d'un état, pour qui lit sans écrire. */
export function rowStateLabel(state: RowState): string {
  return state === 'ok' ? 'OK' : state === 'low' ? 'Faible' : 'Rupture';
}

/** Les articles du catalogue, puis ceux reçus mais retirés du catalogue depuis. */
function productsOf(
  sources: StockRowSources,
): readonly Pick<StockRow, 'sku' | 'name' | 'categoryId' | 'family' | 'saleUnit' | 'internal'>[] {
  const known = new Set(sources.articles.map((article) => article.sku));
  return [
    ...sources.articles.map(({ sku, name, categoryId, family, saleUnit, internal }) => ({
      sku,
      name,
      categoryId,
      family,
      saleUnit,
      internal,
    })),
    ...sources.stock
      .filter((line) => !known.has(line.sku))
      .map((line) => ({
        sku: line.sku,
        name: line.label,
        categoryId: null,
        family: null,
        saleUnit: line.saleUnit,
        internal: false,
      })),
  ];
}

/** Le rang de tri : ruptures et stocks faibles, puis les demandés, puis le reste. */
function rankOf(row: StockRow): number {
  if (row.state !== 'ok') {
    return 0;
  }
  return row.asap + row.tomorrow > 0 ? 1 : 2;
}

function draftQuantities(draft: SiteResupplyDraftView | null): ReadonlyMap<string, number> {
  return new Map((draft?.lines ?? []).map((line) => [line.sku, line.quantity] as const));
}

function unitKey(line: { readonly sku: string; readonly saleUnit: OrderSaleUnit }): string {
  return `${line.saleUnit}:${line.sku}`;
}
