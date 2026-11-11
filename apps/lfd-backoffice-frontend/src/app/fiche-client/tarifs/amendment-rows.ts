import type { CompanyPricingCategoryView, MercurialeAmendmentPreviewView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';

import {
  discountAfter,
  tieredSkusOf,
  type AmendmentDiff,
  type AmendmentEdit,
  type AmendmentState,
} from './amendment-diff';
import type { DearerArticle } from './amendment-recap';
import { localAfter, rowLabel, type RowLabel } from './amendment-row-label';
import { eurosIn } from './draft-prices';
import { discountArticlesOf } from './general-discount-pricing';

/** Le prix d'après tel que la table l'affiche. */
export type AfterCell =
  | { readonly kind: 'price'; readonly millicents: number; readonly floored: boolean }
  /** Inchangé : le prix d'aujourd'hui vaut. */
  | { readonly kind: 'same' }
  /** L'article sort de la mercuriale : seule la caisse sait son prix. */
  | { readonly kind: 'deferred' };

/** Une ligne de la table de l'avenant. */
export interface AmendmentRow {
  readonly sku: string;
  readonly name: string;
  readonly shelfId: string;
  /** La ligne secondaire discrète : famille, prix de base, limite. */
  readonly meta: string;
  /** Ce qu'il paie à la date d'effet sans l'avenant ; `null` = absent de l'aperçu. */
  readonly beforeMillicents: number | null;
  readonly after: AfterCell;
  readonly catalogMillicents: number;
  /** Le prix ferme saisi, en euros. */
  readonly euros: number | null;
  /** Une ligne à paliers : non modifiable, on peut seulement la retirer. */
  readonly tiered: boolean;
  readonly tieredRemoved: boolean;
  readonly label: RowLabel | null;
  /** Le prix d'après dépasse celui d'aujourd'hui : le client paiera plus cher. */
  readonly dearer: boolean;
}

function metaOf(shelf: string, catalog: number, floor: number | null): string {
  const limit = floor === null ? 'sans limite' : `limite ${formatEuros(floor)}`;
  return `${shelf} · base ${formatEuros(catalog)} · ${limit}`;
}

/**
 * **Les lignes de la table**, dans l'ordre du catalogue. « Après » vient de
 * l'aperçu quand il a été calculé sur la saisie d'aujourd'hui (`fresh`) ;
 * sinon de l'écran pour ce que la mercuriale fait, et « recalculé à la
 * vérification » pour ce qui en sort.
 */
export function amendmentRows(
  categories: readonly CompanyPricingCategoryView[],
  state: AmendmentState,
  edit: AmendmentEdit,
  diff: AmendmentDiff,
  preview: MercurialeAmendmentPreviewView | null,
  fresh: boolean,
): readonly AmendmentRow[] {
  const items = new Map((preview?.items ?? []).map((item) => [item.sku, item]));
  const tiered = tieredSkusOf(state);
  const after = discountAfter(state, diff);
  const articles = new Map(discountArticlesOf(categories).map((article) => [article.sku, article]));
  return categories.flatMap((category) =>
    category.items.flatMap((entry) => {
      const article = articles.get(entry.sku);
      if (article === undefined) {
        return [];
      }
      const item = items.get(entry.sku);
      const label = rowLabel(article, state, edit, diff);
      const local = localAfter(article, edit, after);
      let cell: AfterCell;
      if (fresh && item !== undefined) {
        cell = { kind: 'price', millicents: item.afterMillicents, floored: item.floored };
      } else if (label?.changed !== true) {
        cell = { kind: 'same' };
      } else {
        cell = local === null ? { kind: 'deferred' } : { kind: 'price', ...local };
      }
      return [
        {
          sku: entry.sku,
          name: entry.name,
          shelfId: category.id,
          meta: metaOf(category.name, article.canonicalMillicents, article.floorMillicents),
          beforeMillicents: item?.beforeMillicents ?? null,
          after: cell,
          catalogMillicents: article.canonicalMillicents,
          euros: eurosIn(edit.firm, entry.sku),
          tiered: tiered.has(entry.sku),
          tieredRemoved: edit.removedTiered.has(entry.sku),
          label,
          dearer:
            cell.kind === 'price' && item !== undefined && cell.millicents > item.beforeMillicents,
        },
      ];
    }),
  );
}

/** Les articles que l'avenant rend plus chers qu'avant, pour l'avertissement du récapitulatif. */
export function dearerArticles(rows: readonly AmendmentRow[]): readonly DearerArticle[] {
  return rows.flatMap((row) =>
    row.dearer && row.after.kind === 'price' && row.beforeMillicents !== null
      ? [
          {
            name: row.name,
            beforeMillicents: row.beforeMillicents,
            afterMillicents: row.after.millicents,
          },
        ]
      : [],
  );
}
