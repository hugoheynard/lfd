import type { OrderMetricsView } from '@lfd/contracts';

/**
 * **L'allure du mois** — le chiffre d'affaires cumulé depuis le 1er, contre le
 * mois précédent au **même jour**.
 *
 * Pourquoi cette lecture et pas une autre : c'est la seule qui réponde en une
 * seconde à la question que se posent le commercial ET le patron — *est-ce qu'on
 * fait mieux que le mois dernier ?* Un CA journalier brut est illisible (les
 * jours de livraison font des dents de scie) ; un total mensuel n'est comparable
 * qu'à la fin du mois, donc trop tard pour agir. Le cumul, lui, se compare
 * **chaque jour**, et l'écart entre les deux courbes EST le message.
 *
 * Tout est pur et testé : le décompte par mois, le mois précédent plus court que
 * le courant, et le mois précédent vide sont trois pièges qu'on écrit de travers
 * à la première tentative.
 */

/** Le cumul d'un mois, jour par jour (index 0 = le 1er du mois). */
export interface MonthPace {
  /** Cumul en centimes, un point par jour écoulé. */
  readonly cumulative: readonly number[];
  /** Total du mois sur les jours connus. */
  readonly total: number;
}

export interface RevenuePace {
  readonly current: MonthPace;
  readonly previous: MonthPace;
  /** Le cumul du mois précédent **au même jour** — la seule comparaison honnête. */
  readonly previousAtSameDay: number;
  /**
   * L'écart en pourcentage à ce jour, ou `null` quand le mois précédent était à
   * zéro : une hausse « infinie » n'est pas une information.
   */
  readonly percent: number | null;
  readonly direction: 'up' | 'down' | 'flat';
  /** Le quantième d'aujourd'hui (1..31) — où planter le repère. */
  readonly dayOfMonth: number;
  /** Nombre de jours à tracer : le plus long des deux mois. */
  readonly length: number;
}

/** `2026-08-17` → `2026-08`. */
function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** Le mois qui précède `2026-01` → `2025-12`. */
function previousMonthKey(month: string): string {
  const parts = month.split('-');
  const year = Number(parts[0]);
  const index = Number(parts[1]);
  if (index === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(index - 1).padStart(2, '0')}`;
}

/** Le cumul d'un mois, dans l'ordre des jours. */
function paceOf(metrics: OrderMetricsView, month: string): MonthPace {
  const cumulative: number[] = [];
  let running = 0;
  metrics.days.forEach((day, index) => {
    if (monthKey(day) !== month) {
      return;
    }
    running += metrics.caCents[index] ?? 0;
    cumulative.push(running);
  });
  return { cumulative, total: running };
}

/**
 * L'allure du mois en cours. `today` est injecté — un calcul qui lit l'horloge
 * lui-même ne se teste pas, et diverge entre le serveur et le navigateur.
 */
export function revenuePace(metrics: OrderMetricsView, today: Date): RevenuePace {
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const current = paceOf(metrics, month);
  const previous = paceOf(metrics, previousMonthKey(month));
  const dayOfMonth = today.getDate();

  // Le mois précédent peut être plus court (28 février contre 31 mars) : on
  // compare alors à son DERNIER jour, faute de mieux — jamais à zéro, qui
  // laisserait croire à un mois exceptionnel.
  const index = Math.min(dayOfMonth, previous.cumulative.length) - 1;
  const previousAtSameDay = index < 0 ? 0 : (previous.cumulative[index] ?? 0);
  const currentTotal = current.total;

  return {
    current,
    previous,
    previousAtSameDay,
    percent:
      previousAtSameDay === 0
        ? null
        : Math.round(((currentTotal - previousAtSameDay) / previousAtSameDay) * 100),
    direction: directionOf(currentTotal, previousAtSameDay),
    dayOfMonth,
    length: Math.max(current.cumulative.length, previous.cumulative.length),
  };
}

function directionOf(current: number, previous: number): 'up' | 'down' | 'flat' {
  if (current === previous) {
    return 'flat';
  }
  return current > previous ? 'up' : 'down';
}

/** `1234567` centimes → `12 346 €`. Arrondi à l'euro : on lit une allure, pas une facture. */
export function euros(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString('fr-FR')} €`;
}
