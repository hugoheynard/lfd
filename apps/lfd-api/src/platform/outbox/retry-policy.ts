/**
 * La **reprise** d'une livraison en échec (plan, §7 : N = 10, délai croissant).
 *
 * Pure : l'instant vient de l'appelant. Au-delà de `MAX_DELIVERY_ATTEMPTS`, la
 * livraison n'est plus réservée par le relais — elle reste en base, visible, et
 * ne repart que par un rejeu manuel (§8).
 */
export const MAX_DELIVERY_ATTEMPTS = 10;

/** Premier délai : trente secondes, doublé à chaque échec. */
const FIRST_DELAY_MS = 30_000;
/** Plafond : six heures — un abonné en panne la nuit est repris au matin. */
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/** Délai avant le prochain essai, une fois `attempts` essais échoués (≥ 1). */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(FIRST_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
}

/** Le prochain essai après le `attempts`-ième échec, à compter de `now`. */
export function nextAttemptAt(attempts: number, now: Date): Date {
  return new Date(now.getTime() + retryDelayMs(attempts));
}

/** La livraison a-t-elle épuisé ses essais — une lettre morte ? */
export function isExhausted(attempts: number): boolean {
  return attempts >= MAX_DELIVERY_ATTEMPTS;
}
