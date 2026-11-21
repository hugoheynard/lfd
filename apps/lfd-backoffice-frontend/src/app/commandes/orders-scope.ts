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
 * Une carte du masthead : un compte, et les filtres qui le produisent. Cliquer
 * la carte pose ces filtres — le chiffre et la liste disent alors la même chose.
 */
export interface ScopeCard {
  readonly key: string;
  readonly label: string;
  readonly filters: Partial<OrderListFilters>;
  /** Un compte qui demande d'agir : mis en avant dès qu'il n'est pas nul. */
  readonly alert?: true;
}

/**
 * Les cartes de chaque cadrage, choisies pour la question qu'on s'y pose :
 * aujourd'hui, « qu'est-ce qui sort, qu'est-ce qui coince ? » ; demain,
 * « qu'est-ce qui se prépare ? » ; toutes, « qu'est-ce qui arrive ? ».
 */
export function scopeCards(scope: OrdersScope, today: string): readonly ScopeCard[] {
  const days = scopeDays(scope, today);
  switch (scope) {
    case 'today':
      return [
        { key: 'total', label: 'Pour aujourd’hui', filters: days },
        { key: 'ready', label: 'Prêtes', filters: { ...days, status: 'ready' } },
        { key: 'pickup', label: 'Retraits', filters: { ...days, method: 'pickup' } },
        { key: 'delivery', label: 'Livraisons', filters: { ...days, method: 'delivery' } },
        {
          key: 'payment-failed',
          label: 'Règlement en échec',
          filters: { ...days, paymentStatus: 'failed' },
          alert: true,
        },
      ];
    case 'tomorrow':
      return [
        { key: 'total', label: 'Pour demain', filters: days },
        { key: 'pickup', label: 'Retraits', filters: { ...days, method: 'pickup' } },
        { key: 'delivery', label: 'Livraisons', filters: { ...days, method: 'delivery' } },
        { key: 'pro', label: 'Pro', filters: { ...days, clientele: 'pro' } },
        { key: 'public', label: 'Particuliers', filters: { ...days, clientele: 'public' } },
      ];
    case 'all':
      return [
        {
          key: 'placed-today',
          label: 'Passées aujourd’hui',
          filters: { placedFrom: today, placedTo: today },
        },
        { key: 'today', label: 'Pour aujourd’hui', filters: scopeDays('today', today) },
        { key: 'tomorrow', label: 'Pour demain', filters: scopeDays('tomorrow', today) },
        {
          key: 'payment-failed',
          label: 'Règlement en échec',
          filters: { paymentStatus: 'failed' },
          alert: true,
        },
      ];
  }
}
