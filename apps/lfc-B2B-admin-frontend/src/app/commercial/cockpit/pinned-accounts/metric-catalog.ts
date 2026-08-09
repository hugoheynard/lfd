import type { CustomerSheetView } from '@lfd/contracts';

/**
 * Le **catalogue des indicateurs** qu'on peut épingler sur une carte de compte
 * suivi.
 *
 * Un registre, et non une suite de `case` : ajouter un indicateur, c'est ajouter
 * une entrée. Chacun sait se lire depuis la fiche et se mettre en forme lui-même
 * — la carte, elle, n'en connaît aucun.
 *
 * Tous rendent une **chaîne**, y compris quand la donnée manque (`—`) : une
 * carte ne doit jamais afficher `undefined`, et un tiret dit « rien à ce jour »
 * mieux qu'un zéro, qui se confondrait avec un vrai zéro.
 */

export type MetricKey =
  | 'total_spent'
  | 'orders'
  | 'recurring'
  | 'average_ticket'
  | 'trend_30d'
  | 'last_order'
  | 'member_since';

export interface MetricDefinition {
  readonly key: MetricKey;
  /** Ce qui titre la valeur sur la carte — deux mots, pas une phrase. */
  readonly label: string;
  /** La valeur, déjà mise en forme. */
  readonly read: (sheet: CustomerSheetView) => string;
  /**
   * Le ton, quand la valeur en porte un (une tendance monte ou descend). Les
   * indicateurs neutres n'en rendent aucun — une carte tout en couleur ne
   * hiérarchise plus rien.
   */
  readonly tone?: (sheet: CustomerSheetView) => 'up' | 'down' | null;
}

/** `123456` centimes → `1 235 €`. Arrondi à l'euro : c'est un repère, pas une facture. */
function euros(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString('fr-FR')} €`;
}

/** `2026-08-09T…` → `9 août`. L'année est tue tant qu'elle est l'année en cours. */
function shortDate(iso: string, today: Date): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

const CATALOG: readonly MetricDefinition[] = [
  {
    key: 'total_spent',
    label: 'Total dépensé',
    read: (sheet) => euros(sheet.stats.totalSpentCents),
  },
  { key: 'orders', label: 'Commandes', read: (sheet) => `${sheet.stats.ordersCount}` },
  {
    key: 'recurring',
    label: 'Paniers récurrents',
    read: (sheet) => `${sheet.stats.recurringBasketsCount}`,
  },
  {
    key: 'average_ticket',
    label: 'Panier moyen',
    // Zéro commande ⇒ pas de panier moyen. Afficher « 0 € » laisserait croire à
    // des commandes à zéro euro.
    read: (sheet) => (sheet.stats.ordersCount === 0 ? '—' : euros(sheet.stats.averageTicketCents)),
  },
  {
    key: 'trend_30d',
    label: 'Tendance 30 j',
    read: (sheet) => {
      const { percent, direction } = sheet.stats.trend;
      if (percent === null) {
        return direction === 'flat' ? '—' : direction === 'up' ? 'nouveau' : '—';
      }
      return `${percent > 0 ? '+' : ''}${percent} %`;
    },
    tone: (sheet) => {
      const { direction } = sheet.stats.trend;
      return direction === 'flat' ? null : direction;
    },
  },
  {
    key: 'last_order',
    label: 'Dernière commande',
    read: (sheet) => {
      const last = sheet.recentOrders[0];
      return last === undefined ? '—' : shortDate(last.placedAt, new Date());
    },
  },
  {
    key: 'member_since',
    label: 'Client depuis',
    read: (sheet) => shortDate(sheet.createdAt, new Date()),
  },
];

/** Le catalogue, dans l'ordre où on le propose. */
export const METRICS: readonly MetricDefinition[] = CATALOG;

/** Un indicateur par sa clé, ou `undefined` si la clé est inconnue (stockage ancien). */
export function metricByKey(key: string): MetricDefinition | undefined {
  return CATALOG.find((metric) => metric.key === key);
}

/** Ceux qu'on peut encore ajouter — proposer un doublon n'aurait aucun sens. */
export function availableMetrics(chosen: readonly string[]): readonly MetricDefinition[] {
  return CATALOG.filter((metric) => !chosen.includes(metric.key));
}
