import type {
  OrderSaleUnit,
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyTarget,
  SiteResupplyDraftView,
  StockAlertLevel,
  UnorderedReceiptLineView,
} from '@lfd/contracts';

/** L'état d'une ligne : `ok` n'est pas une alerte, c'est l'absence d'alerte. */
export type RowState = 'ok' | StockAlertLevel;

/** Une ligne de la table du réassort : un produit, son stock, son état et sa demande. */
export interface StockRow {
  readonly sku: string;
  readonly name: string;
  /** La famille de l'article ; `null` pour un article reçu puis retiré du catalogue. */
  readonly categoryId: string | null;
  /**
   * L'unité de l'article : au poids, le stock, la demande et le reçu sans
   * commande comptent des GRAMMES, saisis en grammes et dits « 1,25 kg »
   * (lot L2b-4).
   */
  readonly saleUnit: OrderSaleUnit;
  readonly stock: number;
  readonly state: RowState;
  readonly asap: number;
  readonly tomorrow: number;
  /** Le reçu sans commande de l'article ; `null` s'il n'y en a pas. */
  readonly unordered: number | null;
}

/** La puce « Tout » : aucun filtre de famille. Hors de l'espace des identifiants de famille. */
export const ALL_CATEGORIES = '';

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
    saleUnit: product.saleUnit,
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

/** Les puces et la recherche se combinent : une ligne passe les deux filtres. */
export function filterStockRows(
  rows: readonly StockRow[],
  query: string,
  category: string,
): readonly StockRow[] {
  const needle = normalize(query.trim());
  return rows.filter(
    (row) =>
      (category === ALL_CATEGORIES || row.categoryId === category) &&
      (needle === '' || normalize(`${row.name} ${row.sku}`).includes(needle)),
  );
}

/** « Tout », puis une puce par famille présente au catalogue, dans son ordre. */
export function categoryOptionsOf(
  articles: readonly ResupplyArticleView[],
): readonly { readonly value: string; readonly label: string }[] {
  const families = new Map<string, string>();
  for (const article of articles) {
    if (!families.has(article.categoryId)) {
      families.set(article.categoryId, article.categoryName);
    }
  }
  return [
    { value: ALL_CATEGORIES, label: 'Tout' },
    ...[...families].map(([value, label]) => ({ value, label })),
  ];
}

/** Le libellé d'un état, pour qui lit sans écrire. */
export function rowStateLabel(state: RowState): string {
  return state === 'ok' ? 'OK' : state === 'low' ? 'Faible' : 'Rupture';
}

/** Les articles du catalogue, puis ceux reçus mais retirés du catalogue depuis. */
function productsOf(
  sources: StockRowSources,
): readonly Pick<StockRow, 'sku' | 'name' | 'categoryId' | 'saleUnit'>[] {
  const known = new Set(sources.articles.map((article) => article.sku));
  return [
    ...sources.articles.map(({ sku, name, categoryId, saleUnit }) => ({
      sku,
      name,
      categoryId,
      saleUnit,
    })),
    ...sources.stock
      .filter((line) => !known.has(line.sku))
      .map((line) => ({
        sku: line.sku,
        name: line.label,
        categoryId: null,
        saleUnit: line.saleUnit,
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

/** La recherche ignore accents et casse : « eclair » trouve « Éclair ». */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function draftQuantities(draft: SiteResupplyDraftView | null): ReadonlyMap<string, number> {
  return new Map((draft?.lines ?? []).map((line) => [line.sku, line.quantity] as const));
}

function unitKey(line: { readonly sku: string; readonly saleUnit: OrderSaleUnit }): string {
  return `${line.saleUnit}:${line.sku}`;
}
