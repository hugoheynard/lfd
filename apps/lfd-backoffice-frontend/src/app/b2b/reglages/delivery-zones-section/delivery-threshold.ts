/**
 * Le seuil de livraison offerte à l'écran (plan `plan-livraison-offerte.md`,
 * lot 1) : saisi en euros HT, écrit en centimes entiers. Vide = pas de
 * livraison offerte — `null`, jamais `0`, qui dirait « offerte dès le premier
 * euro ».
 */

/** Un seuil refusé à la saisie : négatif, ou plus fin que le centime. */
export const INVALID_THRESHOLD = 'invalid';

const EPSILON = 1e-6;

/** Les centimes du serveur, en euros pour le champ. */
export function thresholdEuros(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

/** Les euros du champ, en centimes ; `INVALID_THRESHOLD` si la forme est refusée. */
export function thresholdCents(euros: number | null): number | null | typeof INVALID_THRESHOLD {
  if (euros === null) {
    return null;
  }
  const cents = Math.round(euros * 100);
  if (!Number.isFinite(euros) || euros < 0 || Math.abs(euros * 100 - cents) > EPSILON) {
    return INVALID_THRESHOLD;
  }
  return cents;
}

/** « dès 80,00 € HT ». */
export function formatThreshold(cents: number): string {
  const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
  return `dès ${euros} HT`;
}

/** L'aide sous le champ : le refus de forme, sinon ce que veut dire le vide. */
export function thresholdHint(euros: number | null, emptyMeaning: string): string {
  if (thresholdCents(euros) === INVALID_THRESHOLD) {
    return 'Un montant positif, au centime près.';
  }
  return euros === null ? emptyMeaning : 'Sur le panier HT, remises déduites.';
}
