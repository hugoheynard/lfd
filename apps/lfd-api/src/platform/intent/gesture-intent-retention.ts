/**
 * **Combien de jours une intention de geste reste au registre** — décidé par
 * Hugo le 2026-11-12 : sept jours, puis elle est purgée.
 *
 * Une clé rejouée APRÈS la purge n'est plus reconnue : le geste se refait. La
 * durée couvre donc largement les renvois réels d'une même clé — une requête
 * renvoyée par le réseau, un onglet rouvert sur un dialogue resté ouvert, un
 * coursier hors ligne qui vide sa file au retour — et dépasse de loin la
 * fenêtre de Stripe pour la même garantie (24 h).
 */
export const GESTURE_INTENT_RETENTION_DAYS = 7;

/** Combien d'intentions un lot supprime : une requête courte, qui ne tient pas la table. */
export const GESTURE_INTENT_PURGE_BATCH_SIZE = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** L'instant avant lequel une intention réclamée est assez ancienne pour être purgée. */
export function gestureIntentPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - GESTURE_INTENT_RETENTION_DAYS * MS_PER_DAY);
}
