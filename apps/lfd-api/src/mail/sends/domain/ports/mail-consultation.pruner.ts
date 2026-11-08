import type { PurgeCensus, PurgeTarget } from "../../../../platform/retention/purge-mode.js";

/**
 * Port de **purge** des consultations du suivi — révélations et recherches
 * plus vieilles que la frontière (`le-suivi-des-e-mails.md`, T2 : 1 an,
 * sous le cran `MAIL_REQUEST_PURGE`).
 */
export abstract class MailConsultationPruner implements PurgeTarget {
  abstract census(cutoff: Date): Promise<PurgeCensus>;
  abstract pruneBatch(cutoff: Date, limit: number): Promise<number>;
}
