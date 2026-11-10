import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CollectionBatch } from "../../domain/entities/collection-batch.js";
import { CollectionBatchRejectedByBankEvent } from "../../domain/events/collection.events.js";
import { BillingStatementRepository } from "../../domain/ports/billing-statement.repository.js";
import { CollectionBatchLock } from "../../domain/ports/collection-batch-lock.js";
import { CollectionBatchRepository } from "../../domain/ports/collection-batch.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import {
  releaseBatch,
  saveReleaseAndPublish,
  type BatchReleasePorts,
} from "../collection-batch-release.js";
import { loadBatchOrFail } from "../collection-batch-support.js";
import { RejectCollectionBatchByBankCommand } from "./reject-collection-batch-by-bank.command.js";

/**
 * **« La banque a rejeté ce fichier »** (plan
 * `documentation/comptabilite/prelevement/plan-lot-rejete-par-la-banque.md`).
 *
 * Dans UNE transaction, et dans CET ordre :
 *
 * 1. le verrou du lot, AVANT toute lecture — un retour enregistré au même
 *    instant l'attend, puis lit le lot rejeté (§ 0.3) ;
 * 2. les retours de ses lignes : un seul suffit à refuser, la remise est partie ;
 * 3. `batch.rejectByBank` (déposé, motif, échéance non atteinte) ;
 * 4. le lot écrit AVANT ses arrêtés : la base n'annule l'arrêté que d'un lot
 *    `constituted` ou `rejected_by_bank` en base — l'ordre inverse de
 *    l'annulation, d'où un handler propre ;
 * 5. ses commandes `collected → due` : elles entreront au lot reconstitué,
 *    sous un AUTRE lot, donc d'autres `MsgId` et `EndToEndId`.
 */
@CommandHandler(RejectCollectionBatchByBankCommand)
export class RejectCollectionBatchByBankHandler implements ICommandHandler<
  RejectCollectionBatchByBankCommand,
  void
> {
  constructor(
    private readonly lock: CollectionBatchLock,
    private readonly batches: CollectionBatchRepository,
    private readonly returns: ReturnableLinesReader,
    private readonly orders: OrderCollectionRepository,
    private readonly statements: BillingStatementRepository,
    private readonly entities: LegalEntityReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RejectCollectionBatchByBankCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.lock.lock(command.batchId);
      const batch = await loadBatchOrFail(this.batches, command.batchId);
      const returned = await this.returnedDebtors(batch);
      batch.rejectByBank(
        { at, staffId: command.staffUserId, reason: command.reason },
        instantToLocal(at).day,
        returned,
      );
      await this.batches.save(batch);
      const ports = this.releasePorts();
      const release = await releaseBatch(ports, batch, "releaseRejected", at);
      await saveReleaseAndPublish(
        ports,
        batch,
        release,
        (entity) =>
          new CollectionBatchRejectedByBankEvent(batch, entity, at, release.released.length),
        at,
      );
    });
  }

  private releasePorts(): BatchReleasePorts {
    const { statements, orders, entities, events } = this;
    return { statements, orders, entities, events };
  }

  /** Les payeurs dont la ligne a un retour enregistré — lus sous le verrou. */
  private async returnedDebtors(batch: CollectionBatch): Promise<readonly string[]> {
    const returned = await this.returns.alreadyReturned(batch.lines.map((line) => line.endToEndId));
    return batch.lines
      .filter((line) => returned.has(line.endToEndId))
      .map((line) => line.debtorName);
  }
}
