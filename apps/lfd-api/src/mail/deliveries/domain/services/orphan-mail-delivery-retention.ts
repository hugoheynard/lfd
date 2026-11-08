/**
 * **Combien de temps un retour sans demande se garde** : 30 jours (plan
 * `documentation/mail/le-suivi-des-e-mails.md`, décision 2). Au-delà,
 * aucune demande ne viendra plus le réclamer — l'envoi qui le précède écrit
 * son identifiant en quelques secondes.
 */
export const ORPHAN_MAIL_DELIVERY_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** L'instant avant lequel un retour orphelin est purgeable. */
export function orphanMailDeliveryCutoff(now: Date): Date {
  return new Date(now.getTime() - ORPHAN_MAIL_DELIVERY_RETENTION_DAYS * MS_PER_DAY);
}
