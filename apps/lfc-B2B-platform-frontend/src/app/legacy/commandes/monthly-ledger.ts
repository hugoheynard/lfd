import { type BillingPeriod, monthLabelFromKey } from './billing-periods';
import type { CommandeRow } from './orders-demo-seed';
import type { PaymentRegimeChange } from './payment-regime-changes';

/**
 * Une **rangée-mois** du grand livre : un mois calendaire aligné sur une seule
 * ligne de la grille, avec son relevé (`period`, s'il existe) et ses commandes
 * **payées à la commande** ce mois-là (`paid`). L'alignement par mois est ce qui
 * met « les commandes de juin dans la rangée juin ».
 */
export interface LedgerMonth {
  readonly key: string;
  readonly label: string;
  readonly period: BillingPeriod | null;
  readonly paid: readonly CommandeRow[];
}

/** Une ligne du grand livre : soit une rangée-mois, soit une pastille de changement. */
export type LedgerRow =
  | { readonly kind: 'month'; readonly month: LedgerMonth }
  | { readonly kind: 'change'; readonly change: PaymentRegimeChange };

/** Clé `AAAA-MM` du mois d'une commande. */
function monthKeyOf(order: CommandeRow): string {
  const date = new Date(order.date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Regroupe les commandes payées à la commande par mois calendaire. */
function paidByMonth(orders: readonly CommandeRow[]): Map<string, CommandeRow[]> {
  const buckets = new Map<string, CommandeRow[]>();
  for (const order of orders) {
    const key = monthKeyOf(order);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [order]);
    } else {
      bucket.push(order);
    }
  }
  return buckets;
}

/**
 * Construit le grand livre : l'**union** des mois portant un relevé et/ou des
 * commandes payées à la commande, du plus récent au plus ancien, avec les
 * **changements de régime** intercalés à la couture du mois où ils prennent effet.
 */
export function buildMonthlyLedger(
  periods: readonly BillingPeriod[],
  immediate: readonly CommandeRow[],
  changes: readonly PaymentRegimeChange[],
): readonly LedgerRow[] {
  const paid = paidByMonth(immediate);
  const periodByKey = new Map(periods.map((period) => [period.key, period] as const));
  const keys = [...new Set([...periodByKey.keys(), ...paid.keys()])].sort().reverse();

  const months: LedgerMonth[] = keys.map((key) => {
    const period = periodByKey.get(key) ?? null;
    return {
      key,
      label: period?.label ?? monthLabelFromKey(key),
      period,
      paid: paid.get(key) ?? [],
    };
  });

  // Changements intercalés à leur couture (mois d'effet), en ordre décroissant.
  const pending = [...changes].sort((a, b) => (a.effectiveKey < b.effectiveKey ? 1 : -1));
  const rows: LedgerRow[] = [];
  let index = 0;
  for (const month of months) {
    let change = pending[index];
    while (change !== undefined && change.effectiveKey > month.key) {
      rows.push({ kind: 'change', change });
      index += 1;
      change = pending[index];
    }
    rows.push({ kind: 'month', month });
  }
  let tail = pending[index];
  while (tail !== undefined) {
    rows.push({ kind: 'change', change: tail });
    index += 1;
    tail = pending[index];
  }
  return rows;
}
