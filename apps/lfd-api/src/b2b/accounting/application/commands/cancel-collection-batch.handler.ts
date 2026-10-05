import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionBatchCancelledEvent } from "../../domain/events/collection.events.js";
import { CollectionBatchRepository } from "../../domain/ports/collection-batch.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { batchEntity, loadBatchOrFail } from "../collection-batch-support.js";
import { CancelCollectionBatchCommand } from "./cancel-collection-batch.command.js";

/**
 * **Annule un lot** avant dépôt (plan §4, dans P1 : sans elle, un lot serait
 * définitif dès le premier essai). Ses commandes repassent `due` et entreront
 * dans la prochaine constitution, sous un AUTRE lot — donc d'autres `MsgId`.
 */
@CommandHandler(CancelCollectionBatchCommand)
export class CancelCollectionBatchHandler implements ICommandHandler<
  CancelCollectionBatchCommand,
  void
> {
  constructor(
    private readonly batches: CollectionBatchRepository,
    private readonly orders: OrderCollectionRepository,
    private readonly entities: LegalEntityReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelCollectionBatchCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      const batch = await loadBatchOrFail(this.batches, command.batchId);
      batch.cancel({ at, staffId: command.staffUserId });
      const released = await this.orders.ofBatch(batch.id);
      for (const order of released) {
        order.release(at);
      }
      await this.batches.save(batch);
      await this.orders.saveAll(released);
      const entity = await batchEntity(this.entities, batch);
      await this.events.publishTraced(new CollectionBatchCancelledEvent(batch, entity, at));
    });
  }
}
