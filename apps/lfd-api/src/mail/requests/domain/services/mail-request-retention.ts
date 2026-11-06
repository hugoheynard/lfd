import type { MailRequestStatus } from "../entities/mail-request.js";

/**
 * **Combien de temps le suivi d'un envoi se garde** — tranché par Hugo le
 * 2026-11-06 (`documentation/editeur-de-contenu/plan-service-e-mails.md`, § 7) :
 * un an, puis la demande est purgée, son destinataire avec elle. La durée est
 * au registre RGPD (`documentation/legal/rgpd-registre.json`).
 */
export const MAIL_REQUEST_RETENTION_DAYS = 365;

/**
 * Jeton du cran de sûreté (`AppConfig.mailRequestPurgeMode()`) : `dry-run` par
 * défaut, la purge n'est PAS activée au 2026-11-06.
 */
export const MAIL_REQUEST_PURGE_MODE = Symbol("MAIL_REQUEST_PURGE_MODE");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Les états après lesquels la demande ne bouge plus d'elle-même. `failed` y
 * est : un nouvel essai peut encore la faire passer à `sent`, mais un an sans
 * essai, c'est une demande abandonnée — et c'est la consigne du lot.
 * `requested` n'y est jamais : une demande en attente n'a pas fini son travail.
 */
export const PURGEABLE_MAIL_REQUEST_STATUSES = ["sent", "failed", "refused"] as const;

/** L'instant avant lequel une demande close est assez ancienne pour être purgée. */
export function mailRequestPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - MAIL_REQUEST_RETENTION_DAYS * MS_PER_DAY);
}

/** Ce que la règle lit d'une demande. */
export interface MailRequestRetentionFacts {
  readonly status: MailRequestStatus;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
}

/**
 * La règle de purge d'une demande : close, et close strictement avant la
 * frontière — `sentAt` pour un envoi, `failedAt` pour un échec ou un refus.
 * Le SQL de `PrismaMailRequestPruner` dit la même règle, éprouvée par l'e2e.
 */
export function isMailRequestPurgeable(facts: MailRequestRetentionFacts, cutoff: Date): boolean {
  switch (facts.status) {
    case "requested":
    case "sending":
      // Une demande en vol n'est jamais purgée : le balayeur peut encore la
      // reprendre (S1b, plan § 8).
      return false;
    case "sent":
      return facts.sentAt !== null && facts.sentAt < cutoff;
    case "failed":
    case "refused":
      return facts.failedAt !== null && facts.failedAt < cutoff;
  }
}
