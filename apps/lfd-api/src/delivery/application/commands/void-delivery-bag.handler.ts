import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBagVoidedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryBagRepository } from "../../domain/ports/delivery-bag.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { citedOrderOf, loadBag } from "../delivery-loading-support.js";
import { VoidDeliveryBagCommand } from "./void-delivery-bag.command.js";

/**
 * **Annule** l'étiquette d'un sac de trop (lot 4, L4-C19) — refusé s'il est
 * chargé (décharger d'abord) ou si sa tournée est partie. Annuler un sac déjà
 * annulé n'écrit rien. Le sac reste : le nombre de sacs de la commande est
 * celui de ses sacs non annulés.
 *
 * @throws {DeliveryBagNotFoundError} @throws {BagLoadedError}
 * @throws {DeliveryRoundDepartedError} @throws {DeliveryLoadingStaleError}
 */
@CommandHandler(VoidDeliveryBagCommand)
export class VoidDeliveryBagHandler implements ICommandHandler<VoidDeliveryBagCommand, void> {
  constructor(
    private readonly bags: DeliveryBagRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: VoidDeliveryBagCommand): Promise<void> {
    await this.uow.run(async () => {
      const found = await loadBag(this.bags, command.bagId);
      const loading = await this.loadings.forOrder(found.orderId, found.id);
      // Relu SOUS le verrou : un chargement ou une annulation concurrents sont
      // passés, et on voit ce qu'ils ont écrit.
      const bag = await loadBag(this.bags, found.id);
      if (!bag.void(this.clock.now(), loading)) {
        return;
      }
      await this.bags.save(bag);
      await this.events.publishTraced(
        new DeliveryBagVoidedEvent(bag, await citedOrderOf(this.orders, bag.orderId)),
      );
    });
  }
}
