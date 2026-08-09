import type { CustomerSpendTrend } from '@lfd/contracts';

/**
 * La **mise en forme** de la fiche client : de l'argent, une ancienneté, une
 * tendance. Pur et testé — c'est là que se cachent les mensonges d'affichage
 * (« +∞ % », « depuis 0 mois », un centime devenu un euro).
 */

const EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/**
 * Des centimes vers des euros lisibles, **sans décimales** : sur une fiche qui
 * se lit pendant un appel, « 12 480 € » se retient, « 12 480,00 € » se déchiffre.
 */
export function euros(cents: number): string {
  return EUROS.format(Math.round(cents / 100));
}

/**
 * Depuis combien de temps le compte existe, en clair.
 *
 * On ne descend pas sous le mois : « inscrit depuis 3 jours » se lit sur la date
 * elle-même, et l'ancienneté sert à situer une relation, pas à compter des jours.
 */
export function membershipAge(createdAt: string, now: Date): string {
  const months = monthsBetween(new Date(createdAt), now);
  if (months < 1) {
    return 'ce mois-ci';
  }
  if (months < 12) {
    return `${months} mois`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0
    ? `${years} an${years > 1 ? 's' : ''}`
    : `${years} an${years > 1 ? 's' : ''} et ${rest} mois`;
}

function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? Math.max(0, months - 1) : Math.max(0, months);
}

/**
 * Comment s'écrit la tendance des 30 derniers jours.
 *
 * Sans point de comparaison (période précédente à zéro), on **décrit** au lieu de
 * chiffrer : « premier chiffre » dit la vérité, « +100 % » l'invente.
 */
export function trendLabel(trend: CustomerSpendTrend): string {
  if (trend.percent === null) {
    return trend.last30Cents === 0 ? 'aucune commande' : 'premier chiffre';
  }
  const sign = trend.percent > 0 ? '+' : '';
  return `${sign}${trend.percent} % sur 30 jours`;
}

/** Le ton d'affichage d'une tendance — une hausse est une bonne nouvelle. */
export function trendTone(trend: CustomerSpendTrend): 'success' | 'alert' | 'neutral' {
  if (trend.direction === 'up') {
    return 'success';
  }
  return trend.direction === 'down' ? 'alert' : 'neutral';
}
