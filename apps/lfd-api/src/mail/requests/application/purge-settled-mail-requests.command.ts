import type { PurgeReport } from "../../../platform/retention/purge-mode.js";

/**
 * Le compte rendu : celui des demandes à la racine (la forme d'avant, que le
 * cron et les e2e lisent), et celui des retours orphelins à côté (T1).
 */
export interface MailPurgeReport extends PurgeReport {
  readonly orphanDeliveries: PurgeReport;
}

/**
 * **Purger le suivi des envois** des demandes closes depuis plus de
 * `MAIL_REQUEST_RETENTION_DAYS` jours (`plan-service-e-mails.md`, § 7). Rend
 * le nombre de demandes supprimées.
 */
export class PurgeSettledMailRequestsCommand {}
