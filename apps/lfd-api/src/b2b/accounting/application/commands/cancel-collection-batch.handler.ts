import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BillingStatementCancelledEvent } from "../../domain/events/billing-statement.events.js";
import { CollectionBatchCancelledEvent } from "../../domain/events/collection.events.js";
import {
  BillingStatementRepository,
  type CancelledStatement,
} from "../../domain/ports/billing-statement.repository.js";
import { CollectionBatchRepository } from "../../domain/ports/collection-batch.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import type { CollectionBatch } from "../../domain/entities/collection-batch.js";
import type { BatchEntity } from "../../domain/events/collection.events.js";
import { batchEntity, loadBatchOrFail } from "../collection-batch-support.js";
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
 */
@CommandHandler(CancelCollectionBatchCommand)
export class CancelCollectionBatchHandler implements ICommandHandler<
  CancelCollectionBatchCommand,
  void
> {
  constructor(
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
      for (const event of cancelledEvents(batch, cancelled, entity, at)) {
        await this.events.publishTraced(event);
      }
    });
  }
}

/** Le payeur et le montant d'un arrêté se relisent sur sa ligne : ils sont les siens. */
function cancelledEvents(
  batch: CollectionBatch,
  cancelled: readonly CancelledStatement[],
  entity: BatchEntity,
  at: Date,
): readonly BillingStatementCancelledEvent[] {
  return cancelled.flatMap(({ statementId, lineRank }) => {
    const line = batch.lines.find((candidate) => candidate.rank === lineRank);
    // Inatteignable : l'arrêté cite sa ligne par clé étrangère.
    if (line === undefined) {
      return [];
    }
    const payer = { id: line.debtorCompanyId, name: line.debtorName };
    return [
      new BillingStatementCancelledEvent(
        statementId,
        lineRank,
        batch,
        entity,
        payer,
        line.amountCents,
        at,
      ),
    ];
  });
}
