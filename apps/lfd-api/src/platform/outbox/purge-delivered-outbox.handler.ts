import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  describePurge,
  type PurgeMode,
  type PurgeReport,
  runPurge,
} from "../retention/purge-mode.js";
import { Clock } from "../time/clock.js";
import { OutboxPruner } from "./outbox-pruner.js";
import { OUTBOX_PURGE_MODE, outboxPurgeCutoff } from "./outbox-retention.js";
import { PurgeDeliveredOutboxCommand } from "./purge-delivered-outbox.command.js";

/** Combien de messages un lot supprime : une requête courte, qui ne tient pas la table. */
export const OUTBOX_PURGE_BATCH_SIZE = 500;

/**
 * La purge de la boîte d'envoi, sous son cran de sûreté (`OUTBOX_PURGE`) :
 * `dry-run` par défaut — elle compte et journalise ce qu'elle supprimerait.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, aucun fait métier ne change ; le compte rendu est sa trace.
 */
@CommandHandler(PurgeDeliveredOutboxCommand)
export class PurgeDeliveredOutboxHandler implements ICommandHandler<
  PurgeDeliveredOutboxCommand,
  PurgeReport
> {
  private readonly logger = new Logger(PurgeDeliveredOutboxHandler.name);

  constructor(
    private readonly pruner: OutboxPruner,
    private readonly clock: Clock,
    @Inject(OUTBOX_PURGE_MODE) private readonly mode: PurgeMode,
  ) {}

  async execute(): Promise<PurgeReport> {
    const cutoff = outboxPurgeCutoff(this.clock.now());
    const report = await runPurge(this.mode, this.pruner, cutoff, OUTBOX_PURGE_BATCH_SIZE);
    this.logger.log(describePurge("boîte d'envoi (messages livrés depuis 30 jours)", report));
    return report;
  }
}
