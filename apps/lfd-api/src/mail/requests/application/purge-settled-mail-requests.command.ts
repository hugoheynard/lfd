/**
 * **Purger le suivi des envois** des demandes closes depuis plus de
 * `MAIL_REQUEST_RETENTION_DAYS` jours (`plan-service-e-mails.md`, § 7). Rend
 * le nombre de demandes supprimées.
 */
export class PurgeSettledMailRequestsCommand {}
