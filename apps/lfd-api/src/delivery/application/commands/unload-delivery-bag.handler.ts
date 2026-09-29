import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBagUnloadedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryBagRepository } from "../../domain/ports/delivery-bag.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { citedOrderOf, loadBag } from "../delivery-loading-support.js";
import { UnloadDeliveryBagCommand } from "./unload-delivery-bag.command.js";

/**
 * **Décharge un sac** d'une tournée encore au dépôt : sa ligne de chargement
 * reste, ses `loaded_*` redeviennent nuls, et le fait au journal garde qui
 * avait chargé, et quand. Un sac qui n'était pas chargé ici n'écrit rien.
 *
 * @throws {DeliveryBagNotFoundError} @throws {BagInOtherRoundError}
 * @throws {DeliveryRoundDepartedError} @throws {DeliveryLoadingStaleError}
 */
@CommandHandler(UnloadDeliveryBagCommand)
export class UnloadDeliveryBagHandler implements ICommandHandler<UnloadDeliveryBagCommand, void> {
  constructor(
    private readonly bags: DeliveryBagRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly directory: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnloadDeliveryBagCommand): Promise<void> {
    await this.uow.run(async () => {
      const bag = await loadBag(this.bags, command.bagId);
      const loading = await this.loadings.forOrder(bag.orderId, bag.id);
      const previous = loading?.unload({ roundId: command.roundId, bagId: bag.id }) ?? null;
      if (loading === null || previous === null) {
        return;
      }
      await this.loadings.save(loading);
      const author = await deliveryAuthorOf(this.directory, previous.loadedBy);
      await this.events.publishTraced(
        new DeliveryBagUnloadedEvent(
          bag,
          await citedOrderOf(this.orders, bag.orderId),
          loading,
          previous,
          author.name === "" ? author.staffUserId : { id: author.staffUserId, name: author.name },
        ),
      );
    });
  }
}
