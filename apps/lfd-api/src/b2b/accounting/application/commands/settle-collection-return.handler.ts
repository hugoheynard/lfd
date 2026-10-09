import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionReturnResolvedEvent } from "../../domain/events/collection-return.events.js";
import { CollectionReturnRepository } from "../../domain/ports/collection-return.repository.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { loadReturnWithLine } from "../collection-return-support.js";
import { SettleCollectionReturnCommand } from "./settle-collection-return.command.js";

/**
 * **Régler autrement** une ligne revenue : le retour est traité, ses
 * commandes passent `settled_otherwise` avec la même note. Permis quel que
 * soit le régime de la ligne — c'est la sortie d'une ligne d'arrêté.
 */
@CommandHandler(SettleCollectionReturnCommand)
export class SettleCollectionReturnHandler implements ICommandHandler<
  SettleCollectionReturnCommand,
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

  async execute(command: SettleCollectionReturnCommand): Promise<void> {
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    await this.uow.run(async () => {
      const { bankReturn, line } = await loadReturnWithLine(
        this.returns,
        this.lines,
        command.returnId,
      );
      bankReturn.settleOtherwise(command.note, stamp);
      const note = bankReturn.toPersistence().resolutionNote ?? command.note;
      const orders = await this.orders.ofLine(line.batchId, line.rank);
      for (const order of orders) {
        order.settleReturned(note, stamp);
      }
      await this.returns.save(bankReturn);
      await this.orders.saveAll(orders);
      await this.events.publishTraced(
        new CollectionReturnResolvedEvent(bankReturn, line, stamp.at),
      );
    });
  }
}
