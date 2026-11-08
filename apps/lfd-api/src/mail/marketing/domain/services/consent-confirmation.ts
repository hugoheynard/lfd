/**
 * **La durée d'une demande d'accord non confirmée** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règle 18) : le
 * lien de confirmation vaut 7 jours, et une ligne `pending` plus vieille est
 * purgée — une commande abandonnée laisse au plus une ligne qui expire
 * (règle 21). La même durée pour les deux : un lien encore valable trouve
 * toujours sa ligne.
 */
export const CONSENT_CONFIRMATION_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Le lien émis à `issuedAt` vaut-il encore à `now` ? Borne exclue, comme la purge. */
export function confirmationIsLive(issuedAt: Date, now: Date): boolean {
  const age = now.getTime() - issuedAt.getTime();
  return age >= 0 && age < CONSENT_CONFIRMATION_DAYS * MS_PER_DAY;
}

/** L'instant avant lequel une demande `pending` est purgeable. */
export function pendingConsentPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - CONSENT_CONFIRMATION_DAYS * MS_PER_DAY);
}
