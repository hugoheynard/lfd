import type { OrderListFilters } from './order-list-filters';

/**
 * **Le cadrage du masthead de la liste** : les commandes à servir aujourd'hui,
 * demain, ou toutes.
 *
 * Ce n'est pas un filtre de plus : c'est une façon d'écrire les deux bornes du
 * jour de retrait ou de livraison (`fulfillmentFrom` / `fulfillmentTo`), qui
 * restent la seule source dans l'adresse. Le cadrage se LIT donc sur elles —
 * une plage posée à la main qui ne vaut ni aujourd'hui ni demain n'allume
 * aucun choix (`null`).
 */
export type OrdersScope = 'today' | 'tomorrow' | 'all';

/** Le jour de Paris qui suit `day` (`AAAA-MM-JJ`), changement d'heure compris. */
export function nextDay(day: string): string {
  // Midi UTC : un jour plus loin reste le jour suivant quel que soit le décalage.
  const noon = new Date(`${day}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + 1);
  return noon.toISOString().slice(0, 10);
}

/** Le cadrage que disent les filtres, `null` pour une plage qui n'en est aucun. */
export function scopeOf(filters: OrderListFilters, today: string): OrdersScope | null {
  const { fulfillmentFrom: from, fulfillmentTo: to } = filters;
  if (from === null && to === null) return 'all';
  if (from !== to) return null;
  if (from === today) return 'today';
  if (from === nextDay(today)) return 'tomorrow';
  return null;
}

/** Les bornes de jour qu'écrit un cadrage. */
export function scopeDays(
  scope: OrdersScope,
  today: string,
): Pick<OrderListFilters, 'fulfillmentFrom' | 'fulfillmentTo'> {
  const day = scope === 'today' ? today : scope === 'tomorrow' ? nextDay(today) : null;
  return { fulfillmentFrom: day, fulfillmentTo: day };
}

/**
 * Un compte du panneau des statistiques, et les filtres qui le produisent :
 * le toucher pose ces filtres, et la liste dit alors le même chiffre.
 */
export interface ScopeStat {
  readonly key: string;
  readonly label: string;
  readonly filters: Partial<OrderListFilters>;
}

/**
 * Les comptes de chaque cadrage, sortis de la liste dans un panneau (Hugo,
 * 2026-11-28) : aujourd'hui, ce qui sort et comment ; demain, ce qui se
 * prépare ; toutes, ce qui arrive.
 */
export function scopeStats(scope: OrdersScope, today: string): readonly ScopeStat[] {
  const days = scopeDays(scope, today);
  const split: readonly ScopeStat[] = [
    { key: 'pickup', label: 'Retraits', filters: { ...days, method: 'pickup' } },
    { key: 'delivery', label: 'Livraisons', filters: { ...days, method: 'delivery' } },
    { key: 'pro', label: 'Pro', filters: { ...days, clientele: 'pro' } },
    { key: 'public', label: 'Particuliers', filters: { ...days, clientele: 'public' } },
  ];
  switch (scope) {
    case 'today':
      return [{ key: 'ready', label: 'Prêtes', filters: { ...days, status: 'ready' } }, ...split];
    case 'tomorrow':
      return split;
    case 'all':
      return [
        {
          key: 'placed-today',
          label: 'Passées aujourd’hui',
          filters: { placedFrom: today, placedTo: today },
        },
        { key: 'today', label: 'Pour aujourd’hui', filters: scopeDays('today', today) },
        { key: 'tomorrow', label: 'Pour demain', filters: scopeDays('tomorrow', today) },
      ];
  }
}
