import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CollectionBatch } from "../../domain/entities/collection-batch.js";
import { CollectionBatchDepositedEvent } from "../../domain/events/collection.events.js";
import { BatchNoticeStatesReader } from "../../domain/ports/batch-notice-states.reader.js";
import { CancelledOrdersReader } from "../../domain/ports/cancelled-orders.reader.js";
import { CollectionBatchRepository } from "../../domain/ports/collection-batch.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateRecheckReader } from "../../domain/ports/mandate-recheck.reader.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { batchEntity, loadBatchOrFail } from "../collection-batch-support.js";
import { DepositCollectionBatchCommand } from "./deposit-collection-batch.command.js";

/**
 * **Marque un lot déposé** (plan §2, §3, P2).
 *
 * Avant, il RELIT le monde : chaque mandat figé est-il encore actif, sur le
 * même compte ? Chaque commande est-elle encore vivante ? Le moindre écart
 * refuse, en nommant la société ou la commande — le lot s'annule alors et se
 * reconstitue. Un fichier déposé qui ne correspond plus à la réalité serait un
 * prélèvement sous un mandat révoqué, ou d'une commande qui n'a rien produit.
 *
 * Et l'avis de prélèvement de chaque ligne doit être PARTI (PA2) : en file
 * ne suffit pas, le refus nomme les payeurs en défaut.
 *
 * Après : le lot est `deposited`, ses commandes `collected`.
 */
@CommandHandler(DepositCollectionBatchCommand)
export class DepositCollectionBatchHandler implements ICommandHandler<
  DepositCollectionBatchCommand,
  void
> {
  constructor(
    private readonly batches: CollectionBatchRepository,
    private readonly orders: OrderCollectionRepository,
    private readonly mandates: MandateRecheckReader,
    private readonly cancelled: CancelledOrdersReader,
    private readonly notices: BatchNoticeStatesReader,
    private readonly entities: LegalEntityReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DepositCollectionBatchCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      const batch = await loadBatchOrFail(this.batches, command.batchId);
      const problems = await this.recheck(batch);
      const notices = await this.notices.ofBatch(batch.id);
      batch.markDeposited({ at, staffId: command.staffUserId }, problems, notices);
      const collected = await this.orders.ofBatch(batch.id);
      for (const order of collected) {
        order.collect(at);
      }
      await this.batches.save(batch);
      await this.orders.saveAll(collected);
      const entity = await batchEntity(this.entities, batch);
      await this.events.publishTraced(new CollectionBatchDepositedEvent(batch, entity, at));
    });
  }

  /** Ce qui a changé depuis la constitution, en phrases qui nomment. */
  private async recheck(batch: CollectionBatch): Promise<readonly string[]> {
    const { lines } = batch;
    const now = await this.mandates.currentOf(lines.map((line) => line.mandateId));
    const mandateProblems = lines.flatMap((line) => {
      const current = now.get(line.mandateId);
      if (current?.active !== true) {
        return [`le mandat ${line.mandateReference} de ${line.debtorName} n'est plus actif`];
      }
      return current.iban === line.debtorIban
        ? []
        : [`le compte de ${line.debtorName} a changé depuis la constitution`];
    });
    const cancelled = await this.cancelled.cancelledAmong(lines.flatMap((line) => line.orderIds));
    return [
      ...mandateProblems,
      ...cancelled.map((orderNumber) => `la commande ${orderNumber} a été annulée`),
    ];
  }
}
