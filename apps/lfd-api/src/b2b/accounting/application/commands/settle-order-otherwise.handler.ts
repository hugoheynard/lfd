import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionOrderNotFoundError } from "../../domain/errors/collection-errors.js";
import { OrderSettledOtherwiseEvent } from "../../domain/events/collection.events.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { OrderInvoicingLock } from "../../domain/ports/order-invoicing-lock.js";
import { OrderNumbersReader } from "../../domain/ports/order-numbers.reader.js";
import { SettleOrderOtherwiseCommand } from "./settle-order-otherwise.command.js";

/**
 * **« Réglée autrement »** (plan §4, P2) : une commande à prélever, ou écartée,
 * a été payée par un autre chemin. Elle sort du prélèvement pour de bon, avec
 * une note qui dit comment — c'est la seule trace du règlement.
 *
 * Depuis le lot C5 (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.4), la
 * ligne `orders` est verrouillée AVANT `load` : l'annulation et la
 * constitution d'un lot prennent la même, donc aucune ne passe entre la
 * lecture de l'état et son écriture (un `upsert` sans version). Une commande
 * annulée sort de l'assiette : `load` rend `null`, et le refus existant
 * tombe ; sa ligne `cancelled`, de toute façon, `settleOtherwise` la refuse.
 */
@CommandHandler(SettleOrderOtherwiseCommand)
export class SettleOrderOtherwiseHandler implements ICommandHandler<
  SettleOrderOtherwiseCommand,
  void
> {
  constructor(
    private readonly orders: OrderCollectionRepository,
    private readonly rows: OrderInvoicingLock,
    private readonly numbers: OrderNumbersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SettleOrderOtherwiseCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.rows.lock(command.orderId);
      const collection = await this.orders.load(command.orderId);
      const orderNumber = await this.numbers.numberOf(command.orderId);
      if (collection === null || orderNumber === null) {
        throw new CollectionOrderNotFoundError(command.orderId);
      }
      const previous = collection.stateName;
      collection.settleOtherwise(command.note, { at, staffId: command.staffUserId });
      await this.orders.saveAll([collection]);
      await this.events.publishTraced(
        new OrderSettledOtherwiseEvent(
          { id: command.orderId, orderNumber },
          at,
          collection.amountCents,
          previous === "excluded" ? "excluded" : "due",
          collection.toPersistence().settledNote ?? "",
        ),
      );
    });
  }
}
