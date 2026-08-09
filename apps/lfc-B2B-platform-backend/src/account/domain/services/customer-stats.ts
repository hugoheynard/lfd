import type { CustomerSpendTrend } from "@lfd/contracts";

/**
 * Les **chiffres de la fiche client**, calculés à part de toute base : ce sont
 * des règles de lecture (que vaut « +12 % » quand on partait de zéro ?), et
 * elles se testent sans I/O.
 */

/** Le pas de comparaison : 30 jours contre les 30 précédents. */
export const TREND_WINDOW_DAYS = 30;

/**
 * Panier moyen. `0` quand rien n'a été commandé — et non une division par zéro
 * maquillée en `NaN`, qui traverserait le JSON en `null` et casserait l'affichage.
 *
 * Arrondi à l'entier : on compte en centimes, une fraction de centime n'existe pas.
 */
export function averageTicket(totalCents: number, ordersCount: number): number {
  return ordersCount === 0 ? 0 : Math.round(totalCents / ordersCount);
}

/**
 * L'évolution des 30 derniers jours face aux 30 précédents.
 *
 * `percent` reste `null` quand la période précédente est à **zéro** : on ne
 * divise pas par rien, et afficher « +∞ % » ou « +100 % » sur un compte qui
 * démarre serait une mesure inventée. La **direction**, elle, reste lisible :
 * passer de zéro à quelque chose, c'est monter — c'est ce que le commercial veut
 * voir, même sans pourcentage.
 */
export function spendTrend(last30Cents: number, previous30Cents: number): CustomerSpendTrend {
  const direction = directionOf(last30Cents, previous30Cents);
  const percent =
    previous30Cents === 0
      ? null
      : Math.round(((last30Cents - previous30Cents) / previous30Cents) * 100);
  return { last30Cents, previous30Cents, percent, direction };
}

function directionOf(last: number, previous: number): CustomerSpendTrend["direction"] {
  if (last === previous) {
    return "flat";
  }
  return last > previous ? "up" : "down";
}

/** Le début des deux fenêtres de comparaison, depuis « maintenant ». */
export function trendWindows(now: Date): { since: Date; previousSince: Date } {
  const day = 24 * 60 * 60 * 1000;
  return {
    since: new Date(now.getTime() - TREND_WINDOW_DAYS * day),
    previousSince: new Date(now.getTime() - 2 * TREND_WINDOW_DAYS * day),
  };
}
