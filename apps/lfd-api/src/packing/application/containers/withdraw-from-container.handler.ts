import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  citeContainer,
  PackingContainerMovedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { citedOrderOf, lockedSheet, releaseToStock } from "./container-support.js";
import { WithdrawFromContainerCommand } from "./withdraw-from-container.command.js";

/**
 * **Ressort des pièces d'une ligne d'un contenant**, tant que la commande
 * n'est pas fermée : elles redeviennent disponibles dans la réserve, et la
 * ligne n'est plus au bac.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {PackingContainerNotFoundError}
 * @throws {PackingContainerVoidedError} @throws {PackingLineNotFoundError}
 * @throws {InvalidContainerQuantityError} @throws {WithdrawBeyondContentError}
 */
@CommandHandler(WithdrawFromContainerCommand)
export class WithdrawFromContainerHandler implements ICommandHandler<
  WithdrawFromContainerCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly stocks: PackingStockRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: WithdrawFromContainerCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const line = sheet.lineToTouch(command.sku);
      const pieces = sheet.withdraw(command.containerId, command.sku, command.quantity);
      await releaseToStock(this.stocks, command.serviceDay, [
        { sku: command.sku, quantity: pieces },
      ]);
      await this.sheets.save(sheet);
      await this.events.publishTraced(
        new PackingContainerMovedEvent(
          "emptied",
          citedOrderOf(sheet),
          citeContainer(sheet.containerList, command.containerId),
          line,
          pieces,
        ),
      );
    });
  }
}
