import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBinVoidedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryBinRepository } from "../../domain/ports/delivery-bin.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { citedOrderOf, loadBin } from "../delivery-loading-support.js";
import { VoidDeliveryBinCommand } from "./void-delivery-bin.command.js";

/**
 * **Annule** l'étiquette d'un bac de trop (lot 4, L4-C19) — refusé s'il est
 * chargé (décharger d'abord) ou si sa tournée est partie. Annuler un bac déjà
 * annulé n'écrit rien. Le bac reste : le nombre de bacs de la commande est
 * celui de ses bacs non annulés.
 *
 * @throws {DeliveryBinNotFoundError} @throws {BinLoadedError}
 * @throws {DeliveryRoundDepartedError} @throws {DeliveryLoadingStaleError}
 */
@CommandHandler(VoidDeliveryBinCommand)
export class VoidDeliveryBinHandler implements ICommandHandler<VoidDeliveryBinCommand, void> {
  constructor(
    private readonly bins: DeliveryBinRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: VoidDeliveryBinCommand): Promise<void> {
    await this.uow.run(async () => {
      const found = await loadBin(this.bins, command.binId);
      const loading = await this.loadings.forOrder(found.orderId, found.id);
      // Relu SOUS le verrou : un chargement ou une annulation concurrents sont
      // passés, et on voit ce qu'ils ont écrit.
      const bin = await loadBin(this.bins, found.id);
      if (!bin.void(this.clock.now(), loading)) {
        return;
      }
      await this.bins.save(bin);
      await this.events.publishTraced(
        new DeliveryBinVoidedEvent(bin, await citedOrderOf(this.orders, bin.orderId)),
      );
    });
  }
}
