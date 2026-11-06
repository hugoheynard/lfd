/**
 * **Combien de temps un message livré reste dans la boîte d'envoi** — tranché
 * par Hugo le 2026-11-06 (`documentation/editeur-de-contenu/plan-service-e-mails.md`,
 * § 7) : 30 jours après sa livraison, puis il est purgé. Un message dont une
 * livraison n'est pas faite — en attente ou morte — reste, jusqu'à son rejeu.
 */
export const OUTBOX_RETENTION_DAYS = 30;

/** Jeton Nest du cran de sûreté (`AppConfig.outboxPurgeMode()`), doublable en test. */
export const OUTBOX_PURGE_MODE = Symbol("OUTBOX_PURGE_MODE");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** L'instant avant lequel une livraison est assez ancienne pour être purgée. */
export function outboxPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - OUTBOX_RETENTION_DAYS * MS_PER_DAY);
}

/**
 * La règle de purge d'un message, d'après ses livraisons : TOUTES livrées, et
 * toutes strictement avant la frontière.
 *
 * Un message **sans aucune livraison** n'est PAS purgeable : « toutes livrées »
 * serait vrai sur une liste vide, et la décision de Hugo parle d'une ligne
 * livrée — un fait sans abonné n'a jamais été livré. Le SQL de
 * `PrismaOutboxPruner` dit la même règle, éprouvée par l'e2e.
 */
export function isOutboxMessagePurgeable(
  deliveredAts: readonly (Date | null)[],
  cutoff: Date,
): boolean {
  return (
    deliveredAts.length > 0 &&
    deliveredAts.every((deliveredAt) => deliveredAt !== null && deliveredAt < cutoff)
  );
}
