/**
 * **Combien de temps une consultation se garde** : 1 an, comme le suivi
 * qu'elle a consulté (`le-suivi-des-e-mails.md`, T2). Les deux
 * tables décident de l'accès ; au-delà d'un an, aucune révélation ne vaut
 * plus, et la trace se lit au journal.
 */
export const MAIL_CONSULTATION_RETENTION_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** L'instant avant lequel une consultation est purgeable. */
export function mailConsultationPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - MAIL_CONSULTATION_RETENTION_DAYS * MS_PER_DAY);
}
