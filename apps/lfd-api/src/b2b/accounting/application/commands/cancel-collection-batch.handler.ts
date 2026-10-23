import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionBatchCancelledEvent } from "../../domain/events/collection.events.js";
import { BillingStatementRepository } from "../../domain/ports/billing-statement.repository.js";
import { CollectionBatchLock } from "../../domain/ports/collection-batch-lock.js";
import { CollectionBatchRepository } from "../../domain/ports/collection-batch.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import {
  batchEntity,
  loadBatchOrFail,
  statementCancelledEvents,
} from "../collection-batch-support.js";
import { CancelCollectionBatchCommand } from "./cancel-collection-batch.command.js";

/**
 * **Annule un lot** avant dépôt (plan §4, dans P1 : sans elle, un lot serait
 * définitif dès le premier essai). Ses commandes repassent `due` et entreront
 * dans la prochaine constitution, sous un AUTRE lot — donc d'autres `MsgId`.
 *
 * Ses arrêtés de facturation passent `cancelled` dans la même transaction
 * (plan `le-prelevement-suit-la-facture.md`) — APRÈS
 * `batch.cancel()`, qui refuse un lot déposé, et AVANT l'écriture du lot :
 * la base n'accepte l'annulation d'un arrêté que si son lot est encore
 * `constituted` en base. La reconstitution en figera de nouveaux.
 *
 * Sous le verrou du lot, pris avant toute lecture (revue du 2026-10-23) : un
 * dépôt simultané attend, puis lit le lot annulé et refuse.
 */
@CommandHandler(CancelCollectionBatchCommand)
export class CancelCollectionBatchHandler implements ICommandHandler<
  CancelCollectionBatchCommand,
  void
> {
  constructor(
    private readonly lock: CollectionBatchLock,
    private readonly batches: CollectionBatchRepository,
    private readonly orders: OrderCollectionRepository,
    private readonly statements: BillingStatementRepository,
    private readonly entities: LegalEntityReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelCollectionBatchCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      // Le verrou AVANT la lecture, comme le rejet : un dépôt et une annulation
      // simultanés se sérialisent, et le second lit ce que le premier a écrit.
      await this.lock.lock(command.batchId);
      const batch = await loadBatchOrFail(this.batches, command.batchId);
      batch.cancel({ at, staffId: command.staffUserId });
      const cancelled = await this.statements.cancelForBatch(batch.id);
      const released = await this.orders.ofBatch(batch.id);
      for (const order of released) {
        order.release(at);
      }
      await this.batches.save(batch);
      await this.orders.saveAll(released);
      const entity = await batchEntity(this.entities, batch);
      await this.events.publishTraced(new CollectionBatchCancelledEvent(batch, entity, at));
      for (const event of statementCancelledEvents(batch, cancelled, entity, at)) {
        await this.events.publishTraced(event);
      }
    });
  }
}
