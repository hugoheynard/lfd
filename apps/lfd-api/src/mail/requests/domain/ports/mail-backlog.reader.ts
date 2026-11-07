import type { MailBacklog, MailBacklogCriteria } from "../services/mail-backlog.js";

/**
 * Port de **lecture** de la veille du courrier (plan `plan-service-e-mails.md`,
 * § 25) : les demandes coincées et les échecs définitifs, comptés en base.
 *
 * Distinct de `MailRequestRepository` et de `StalledMailRequests` (ISP) : la
 * veille ne charge aucune demande, elle compte. Elle ne change rien.
 */
export abstract class MailBacklogReader {
  abstract read(criteria: MailBacklogCriteria): Promise<MailBacklog>;
}
