import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinDesk } from "../../channels/delivery/index.js";
import {
  citeContainer,
  PackingContainerVoidedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { citedOrderOf, lockedSheet, releaseToStock } from "./container-support.js";
import { VoidPackingContainerCommand } from "./void-packing-container.command.js";

/**
 * **Annule un contenant** (K2b, §5.1) — jamais de suppression : il porte
 * `voided_at`, ses lignes restent, ignorées, et ce qu'il portait retourne à
 * répartir.
 *
 * Un BAC s'annule d'abord chez la livraison, par `BinDesk`, dans cette unité
 * de travail : elle refuse un bac chargé ou une tournée partie, et alors rien
 * n'est écrit ici non plus.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {PackingContainerNotFoundError}
 * @throws {PackingContainerVoidedError} et les refus de la livraison pour un bac.
 */
@CommandHandler(VoidPackingContainerCommand)
export class VoidPackingContainerHandler implements ICommandHandler<
  VoidPackingContainerCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly stocks: PackingStockRepository,
    private readonly desk: BinDesk,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: VoidPackingContainerCommand): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const container = sheet.liveContainer(command.containerId);
      if (container.bin !== null) {
        await this.desk.voidBin(container.bin.binId);
      }
      const released = sheet.voidContainer(command.containerId, {
        at: this.clock.now(),
        by: command.staffUserId,
      });
      await releaseToStock(this.stocks, command.serviceDay, released);
      await this.sheets.save(sheet);
      await this.events.publishTraced(
        new PackingContainerVoidedEvent(
          citedOrderOf(sheet),
          citeContainer(sheet.containerList, command.containerId),
        ),
      );
    });
  }
}
