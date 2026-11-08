import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { describePurge, type PurgeMode, runPurge } from "../../../platform/retention/purge-mode.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrphanMailDeliveryPruner } from "../../deliveries/domain/ports/orphan-mail-delivery.pruner.js";
import { orphanMailDeliveryCutoff } from "../../deliveries/domain/services/orphan-mail-delivery-retention.js";
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
 * (plan `plan-suivi-des-e-mails.md`, décision 2, lot T1). Le compte rendu des
 * demandes reste à la racine de la réponse ; celui des retours est à côté.
 * Et, toujours sous ce cran, les consultations du suivi (révélations et
 * recherches) de plus d'un an (lot T2).
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
    private readonly clock: Clock,
    @Inject(MAIL_REQUEST_PURGE_MODE) private readonly mode: PurgeMode,
  ) {}

  async execute(): Promise<MailPurgeReport> {
    const now = this.clock.now();
    const cutoff = mailRequestPurgeCutoff(now);
    const report = await runPurge(this.mode, this.pruner, cutoff, MAIL_REQUEST_PURGE_BATCH_SIZE);
    this.logger.log(describePurge("suivi des e-mails (demandes closes depuis 1 an)", report));
    const orphanCutoff = orphanMailDeliveryCutoff(now);
    const orphans = await runPurge(
      this.mode,
      this.orphans,
      orphanCutoff,
      MAIL_REQUEST_PURGE_BATCH_SIZE,
    );
    this.logger.log(describePurge("retours d'e-mails sans demande depuis 30 jours", orphans));
    const consultations = await runPurge(
      this.mode,
      this.consultations,
      mailConsultationPurgeCutoff(now),
      MAIL_REQUEST_PURGE_BATCH_SIZE,
    );
    this.logger.log(
      describePurge("consultations du suivi des e-mails de plus d'un an", consultations),
    );
    return { ...report, orphanDeliveries: orphans, consultations };
  }
}
