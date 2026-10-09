import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionReturnResolvedEvent } from "../../domain/events/collection-return.events.js";
import { CollectionReturnRepository } from "../../domain/ports/collection-return.repository.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { loadReturnWithLine } from "../collection-return-support.js";
import { WriteOffCollectionReturnCommand } from "./write-off-collection-return.command.js";

/**
 * **Passer en perte** : le retour est traité, ses commandes passent
 * `written_off`. Ni avoir ni écriture : le traitement comptable attend le
 * cabinet (§ 2 bis-9). Le motif vit sur le retour.
 */
@CommandHandler(WriteOffCollectionReturnCommand)
export class WriteOffCollectionReturnHandler implements ICommandHandler<
  WriteOffCollectionReturnCommand,
  void
> {
  constructor(
    private readonly returns: CollectionReturnRepository,
    private readonly lines: ReturnableLinesReader,
    private readonly orders: OrderCollectionRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: WriteOffCollectionReturnCommand): Promise<void> {
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    await this.uow.run(async () => {
      const { bankReturn, line } = await loadReturnWithLine(
        this.returns,
        this.lines,
        command.returnId,
      );
      bankReturn.writeOff(command.note, stamp);
      const orders = await this.orders.ofLine(line.batchId, line.rank);
      for (const order of orders) {
        order.writeOff(stamp.at);
      }
      await this.returns.save(bankReturn);
      await this.orders.saveAll(orders);
      await this.events.publishTraced(
        new CollectionReturnResolvedEvent(bankReturn, line, stamp.at),
      );
    });
  }
}
