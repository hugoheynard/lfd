import { formatCents } from '@lfd/b2b-ui/order';
import {
  MADE_TO_ORDER_MONTH_WINDOWS,
  type MadeToOrderClientArticle,
  type MadeToOrderMonth,
  type MadeToOrderMonthWindow,
} from '@lfd/contracts';
import type { FoldTableColumn } from 'fold-ng';

/** Les fenêtres du rapport mensuel, telles que le sélecteur les propose. */
export const MONTH_WINDOW_OPTIONS = MADE_TO_ORDER_MONTH_WINDOWS.map((months) => ({
  value: String(months),
  label: `${String(months)} mois`,
}));

/** La fenêtre choisie, ou `null` si la valeur n'en est pas une. */
export function monthWindowOf(value: string): MadeToOrderMonthWindow | null {
  return MADE_TO_ORDER_MONTH_WINDOWS.find((months) => String(months) === value) ?? null;
}

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-10` → « octobre 2026 ». */
export function monthLabel(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return MONTH_LABEL.format(Date.UTC(year ?? 0, (index ?? 1) - 1, 1));
}

/** Une part entre 0 et 1 → « 12,5 % » ; « — » quand le mois n'a rien vendu. */
export function shareLabel(share: number | null): string {
  if (share === null) {
    return '—';
  }
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(share);
}

/** Des pièces, ou des grammes au poids, lus comme on les dit. */
export function quantityLabel(
  article: Pick<MadeToOrderClientArticle, 'quantity' | 'saleUnit'>,
): string {
  const count = new Intl.NumberFormat('fr-FR').format(article.quantity);
  return article.saleUnit === 'weight'
    ? `${count} g`
    : `${count} pièce${article.quantity > 1 ? 's' : ''}`;
}

/** Un montant à zéro se lit « — » : il n'a rien à dire dans une colonne de chiffres. */
function amountOrDash(cents: number): string {
  return cents === 0 ? '—' : formatCents(cents);
}

export const MONTH_COLUMNS: readonly FoldTableColumn<MadeToOrderMonth>[] = [
  { key: 'month', label: 'Mois', value: (row) => monthLabel(row.month) },
  {
    key: 'madeToOrder',
    label: 'Sur mesure HT',
    numeric: true,
    value: (row) => formatCents(row.madeToOrderHtCents),
  },
  {
    key: 'share',
    label: 'Part du CA',
    numeric: true,
    value: (row) => shareLabel(row.madeToOrderShare),
  },
  {
    key: 'orders',
    label: 'Commandes sur mesure',
    numeric: true,
    value: (row) => row.madeToOrderOrders,
  },
  {
    key: 'other',
    label: 'Autres articles HT',
    numeric: true,
    value: (row) => formatCents(row.otherHtCents),
  },
  {
    key: 'unknown',
    label: 'Avant le suivi HT',
    numeric: true,
    value: (row) => amountOrDash(row.unknownHtCents),
  },
  {
    key: 'total',
    label: 'CA HT des lignes',
    numeric: true,
    value: (row) => formatCents(row.totalHtCents),
  },
];

export const ARTICLE_COLUMNS: readonly FoldTableColumn<MadeToOrderClientArticle>[] = [
  { key: 'product', label: 'Article', value: (row) => `${row.productName} (${row.sku})` },
  { key: 'quantity', label: 'Quantité', numeric: true, value: quantityLabel },
  { key: 'orders', label: 'Commandes', numeric: true, value: (row) => row.orders },
  { key: 'amount', label: 'Montant HT', numeric: true, value: (row) => formatCents(row.htCents) },
];

/** Du premier jour du mois de `today` à `today` : la période qu'on ouvre par défaut. */
export function currentMonthPeriod(today: string): { readonly from: string; readonly to: string } {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
