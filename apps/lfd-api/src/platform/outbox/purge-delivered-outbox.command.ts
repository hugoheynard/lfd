/**
 * **Purger la boîte d'envoi** des messages livrés depuis plus de
 * `OUTBOX_RETENTION_DAYS` jours (`plan-service-e-mails.md`, § 7). Rend le
 * nombre de messages supprimés.
 */
export class PurgeDeliveredOutboxCommand {}
