import type { CommandeRow } from './orders-demo-seed';

/**
 * Statut d'une **période de facturation** (relevé mensuel).
 * - `current` : mois en cours, qui accumule — rien à régler tant qu'il n'est pas clos.
 * - `due` : mois clôturé, échéance à venir.
 * - `overdue` : échéance dépassée.
 * - `paid` : relevé réglé.
 */
export type PeriodStatus = 'current' | 'due' | 'overdue' | 'paid';

/** Une période de facturation : un mois, ses commandes, son total et son échéance. */
export interface BillingPeriod {
  /** Clé triable `AAAA-MM`. */
  readonly key: string;
  /** Libellé humain, ex. « Juillet 2026 ». */
  readonly label: string;
  readonly orders: readonly CommandeRow[];
  /** Montant total du mois (toutes commandes). */
  readonly total: number;
  /** Reste à régler = commandes non payées immédiatement. */
  readonly outstanding: number;
  /** Échéance de règlement (ISO `AAAA-MM-JJ`). */
  readonly dueDate: string;
  readonly status: PeriodStatus;
}

/** Première lettre en capitale (« juillet 2026 » → « Juillet 2026 »). */
function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** « Juillet 2026 » à partir de l'année et du mois (1-based). */
function periodLabel(year: number, month: number): string {
  const formatted = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return capitalize(formatted);
}

/** « Juillet 2026 » à partir d'une clé `AAAA-MM` (mois sans relevé, p. ex.). */
export function monthLabelFromKey(key: string): string {
  const parts = key.split('-');
  return periodLabel(Number(parts[0]), Number(parts[1]));
}

/**
 * Échéance = **1er du mois suivant** la période, décalé de `dueDays` (le délai de
 * règlement de la société : 0 = 1er du mois suivant, 14 = +14 j, …).
 */
function computeDueDate(year: number, month: number, dueDays: number): string {
  // `month` est 1-based, donc l'index `month` pointe déjà le mois suivant.
  const due = new Date(Date.UTC(year, month, 1 + dueDays));
  return due.toISOString().slice(0, 10);
}

/**
 * Statut **de démonstration** (front-only) : le mois courant est « en cours », le
 * relevé clôturé le plus récent est « à régler », les plus anciens sont « réglés ».
 * En vrai, le statut viendra des règlements enregistrés + la comparaison à
 * l'échéance (dépassée ⇒ `overdue`).
 */
function demoStatus(index: number, isCurrentMonth: boolean): PeriodStatus {
  if (isCurrentMonth) {
    return 'current';
  }
  return index <= 1 ? 'due' : 'paid';
}

/**
 * Regroupe les commandes par **mois calendaire** en périodes de facturation,
 * de la plus récente à la plus ancienne, chacune avec son total et son échéance.
 */
export function groupIntoPeriods(
  orders: readonly CommandeRow[],
  dueDays: number,
  now: Date,
): readonly BillingPeriod[] {
  const buckets = new Map<string, CommandeRow[]>();
  for (const order of orders) {
    const date = new Date(order.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [order]);
    } else {
      bucket.push(order);
    }
  }

  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const keys = [...buckets.keys()].sort().reverse();

  return keys.map((key, index) => {
    const bucket = buckets.get(key) ?? [];
    const parts = key.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const total = bucket.reduce((sum, order) => sum + order.totalEur, 0);
    const outstanding = bucket.reduce((sum, order) => sum + (order.paid ? 0 : order.totalEur), 0);
    return {
      key,
      label: periodLabel(year, month),
      orders: bucket,
      total,
      outstanding,
      dueDate: computeDueDate(year, month, dueDays),
      status: demoStatus(index, key === currentKey),
    };
  });
}
