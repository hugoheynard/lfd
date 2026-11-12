import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  citeContainer,
  PackingContainerMovedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { citedOrderOf, lockedSheet, movementIntent, releaseToStock } from "./container-support.js";
import { WithdrawFromContainerCommand } from "./withdraw-from-container.command.js";

/**
 * **Ressort des pièces d'une ligne d'un contenant**, tant que la commande
 * n'est pas fermée : elles redeviennent disponibles dans la réserve, et la
 * ligne n'est plus au bac.
 *
 * **Une fois par intention** : la clé de l'écran est scellée dans la même
 * unité de travail que le mouvement ; un rejeu de la même clé ne refait rien
 * et rend le même résultat (rien — la route rend 204), un échec rend
 * l'intention et l'écran peut réessayer.
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
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: WithdrawFromContainerCommand): Promise<void> {
    return this.intents.runSealed(
      movementIntent("packing.withdraw", command, command.containerId),
      NOTHING_TO_REPLAY,
      (seal) => this.withdraw(command, seal),
    );
  }

  private async withdraw(
    command: WithdrawFromContainerCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const line = sheet.lineToTouch(command.sku);
      const pieces = sheet.withdraw(command.containerId, command.sku, command.quantity);
      await releaseToStock(this.stocks, command.serviceDay, [
        { sku: command.sku, quantity: pieces, unit: line.saleUnit },
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
      await seal(undefined);
    });
  }
}
