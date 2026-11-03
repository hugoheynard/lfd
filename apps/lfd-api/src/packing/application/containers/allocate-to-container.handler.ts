import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinDesk } from "../../channels/delivery/index.js";
import { ContainerBinGoneError } from "../../domain/errors/packing-container-errors.js";
import {
  citeContainer,
  PackingContainerMovedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { AllocateToContainerCommand } from "./allocate-to-container.command.js";
import { citedOrderOf, lockedSheet } from "./container-support.js";
import { ArrestedPlanHold } from "../../../production/channels/packing/index.js";
import { holdArrestedPlan } from "../arrested-plan-support.js";

/**
 * **Glisse des pièces d'une ligne dans un contenant** (K2b, décision 2 de
 * Hugo : une ligne se coupe entre deux contenants).
 *
 * Le bac, puis la réserve de l'article, verrouillés dans cet ordre — celui de
 * tous les gestes du poste. Le bac borne la répartition à ce qui reste de la
 * ligne ; la réserve, à ce qui est sorti du four et pas encore ailleurs
 * (`au bac ≤ reçu − rendu`). La ligne est au bac quand toute sa quantité est
 * répartie.
 *
 * Un contenant `bin` dont le bac n'est plus vivant chez la livraison est
 * refusé (défense en profondeur, §5.1).
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {PackingContainerNotFoundError}
 * @throws {PackingContainerVoidedError} @throws {ContainerBinGoneError}
 * @throws {PackingLineNotFoundError} @throws {InvalidContainerQuantityError}
 * @throws {OverAllocationError} @throws {LineNotProducedYetError}
 */
@CommandHandler(AllocateToContainerCommand)
export class AllocateToContainerHandler implements ICommandHandler<
  AllocateToContainerCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly stocks: PackingStockRepository,
    private readonly desk: BinDesk,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly plan: ArrestedPlanHold,
  ) {}

  async execute(command: AllocateToContainerCommand): Promise<void> {
    await this.uow.run(async () => {
      await holdArrestedPlan(this.plan, command.serviceDay);
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const container = sheet.liveContainer(command.containerId);
      // Verrouillé jusqu'au COMMIT : une annulation ne se glisse plus entre
      // la question et l'écriture (audit final du réassort, 2026-11-03).
      if (container.bin !== null && !(await this.desk.holdLiveBin(container.bin.binId))) {
        throw new ContainerBinGoneError(container.bin.code);
      }
      const line = sheet.lineToTouch(command.sku);
      const pieces = sheet.allocate(command.containerId, command.sku, command.quantity, {
        at: this.clock.now(),
        by: command.staffUserId,
      });
      const stock = await this.stocks.lock(command.serviceDay, command.sku);
      stock.take(pieces, line.productName, line.saleUnit);
      await this.stocks.save(stock);
      await this.sheets.save(sheet);
      await this.events.publishTraced(
        new PackingContainerMovedEvent(
          "filled",
          citedOrderOf(sheet),
          citeContainer(sheet.containerList, command.containerId),
          line,
          pieces,
        ),
      );
    });
  }
}
