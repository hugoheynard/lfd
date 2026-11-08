import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  describePurge,
  type PurgeMode,
  type PurgeReport,
  type PurgeTarget,
  runPurge,
} from "../../../platform/retention/purge-mode.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrphanMailDeliveryPruner } from "../../deliveries/domain/ports/orphan-mail-delivery.pruner.js";
import { orphanMailDeliveryCutoff } from "../../deliveries/domain/services/orphan-mail-delivery-retention.js";
import { PendingConsentPruner } from "../../marketing/domain/ports/pending-consent.pruner.js";
import { pendingConsentPurgeCutoff } from "../../marketing/domain/services/consent-confirmation.js";
import { MailConsultationPruner } from "../../sends/domain/ports/mail-consultation.pruner.js";
import { mailConsultationPurgeCutoff } from "../../sends/domain/services/mail-consultation-retention.js";
import { MailRequestPruner } from "../domain/ports/mail-request.pruner.js";
import {
  MAIL_REQUEST_PURGE_MODE,
  mailRequestPurgeCutoff,
} from "../domain/services/mail-request-retention.js";
import {
  type MailPurgeReport,
  PurgeSettledMailRequestsCommand,
} from "./purge-settled-mail-requests.command.js";

/** Combien de demandes un lot supprime : une requête courte, qui ne tient pas la table. */
export const MAIL_REQUEST_PURGE_BATCH_SIZE = 500;

/**
 * La purge du suivi des envois, sous son cran de sûreté (`MAIL_REQUEST_PURGE`) :
 * `dry-run` par défaut — elle compte et journalise ce qu'elle supprimerait.
 *
 * Sous le même cran, les retours du fournisseur orphelins depuis 30 jours
 * (`le-suivi-des-e-mails.md`, décision 2, lot T1). Le compte rendu des
 * demandes reste à la racine de la réponse ; celui des retours est à côté.
 * Et, toujours sous ce cran, les consultations du suivi (révélations et
 * recherches) de plus d'un an (lot T2). Et les demandes d'accord marketing
 * jamais confirmées, de plus de 7 jours (plan de désinscription, C1).
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, aucun fait métier ne change ; le compte rendu est sa trace.
 */
@CommandHandler(PurgeSettledMailRequestsCommand)
export class PurgeSettledMailRequestsHandler implements ICommandHandler<
  PurgeSettledMailRequestsCommand,
  MailPurgeReport
> {
  private readonly logger = new Logger(PurgeSettledMailRequestsHandler.name);

  constructor(
    private readonly pruner: MailRequestPruner,
    private readonly orphans: OrphanMailDeliveryPruner,
    private readonly consultations: MailConsultationPruner,
    private readonly pendingConsents: PendingConsentPruner,
    private readonly clock: Clock,
    @Inject(MAIL_REQUEST_PURGE_MODE) private readonly mode: PurgeMode,
  ) {}

  async execute(): Promise<MailPurgeReport> {
    const now = this.clock.now();
    const report = await this.purge(
      "suivi des e-mails (demandes closes depuis 1 an)",
      this.pruner,
      mailRequestPurgeCutoff(now),
    );
    const orphans = await this.purge(
      "retours d'e-mails sans demande depuis 30 jours",
      this.orphans,
      orphanMailDeliveryCutoff(now),
    );
    const consultations = await this.purge(
      "consultations du suivi des e-mails de plus d'un an",
      this.consultations,
      mailConsultationPurgeCutoff(now),
    );
    const pendingConsents = await this.purge(
      "demandes d'accord marketing non confirmées depuis 7 jours",
      this.pendingConsents,
      pendingConsentPurgeCutoff(now),
    );
    return { ...report, orphanDeliveries: orphans, consultations, pendingConsents };
  }

  /** Un passage, sous le cran, et son compte rendu au journal. */
  private async purge(label: string, target: PurgeTarget, cutoff: Date): Promise<PurgeReport> {
    const report = await runPurge(this.mode, target, cutoff, MAIL_REQUEST_PURGE_BATCH_SIZE);
    this.logger.log(describePurge(label, report));
    return report;
  }
}
