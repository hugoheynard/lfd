import { formatCents } from '@lfd/b2b-ui/order';
import type { ShopTillOrdersDay } from '@lfd/contracts';
import type { FoldTableColumn } from 'fold-ng';

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** `2026-11-20` → « ven. 20 nov. ». */
export function shopTillDayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return DAY_LABEL.format(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
}

/** « 12,40 € (3) » : le TTC et le nombre de commandes ; « — » quand il n'y a rien. */
function amountAndCount(cents: number, count: number): string {
  return count === 0 ? '—' : `${formatCents(cents)} (${String(count)})`;
}

/**
 * Les colonnes du rapport. « Commandé » et « remis », jamais « encaissé » :
 * notre système ne sait pas qu'une telle commande est payée.
 */
export const SHOP_TILL_COLUMNS: readonly FoldTableColumn<ShopTillOrdersDay>[] = [
  { key: 'day', label: 'Jour de retrait', value: (row) => shopTillDayLabel(row.day) },
  { key: 'pickup', label: 'Point', value: (row) => row.pickupLabel ?? 'Point inconnu' },
  {
    key: 'ordered',
    label: 'Commandé TTC',
    numeric: true,
    value: (row) => amountAndCount(row.orderedTtcCents, row.orderedCount),
  },
  {
    key: 'handedOver',
    label: 'Remis TTC',
    numeric: true,
    value: (row) => amountAndCount(row.handedOverTtcCents, row.handedOverCount),
  },
  {
    key: 'notCollected',
    label: 'Non retirées TTC',
    numeric: true,
    value: (row) => amountAndCount(row.notCollectedTtcCents, row.notCollectedCount),
  },
];

/** La clé d'une ligne : un jour et un point. */
export function shopTillRowKey(row: ShopTillOrdersDay): string {
  return `${row.day}:${row.siteId ?? row.pickupLabel ?? ''}`;
}
