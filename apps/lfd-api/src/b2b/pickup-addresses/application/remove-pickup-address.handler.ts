import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { PickupAddressRemovedEvent } from "../domain/pickup-address.events.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { pickupLabel } from "./pickup-label.js";
import { RemovePickupAddressCommand } from "./remove-pickup-address.command.js";

/**
 * Handler **staff** : retire un point de retrait. Mince : il délègue au
 * repository, qui tient les invariants (un seul défaut, au moins un point). Le
 * mur est l'`AdminAuthGuard` sur la route.
 */
@CommandHandler(RemovePickupAddressCommand)
export class RemovePickupAddressHandler implements ICommandHandler<
  RemovePickupAddressCommand,
  void
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemovePickupAddressCommand): Promise<void> {
    await this.uow.run(async () => {
      const label = await pickupLabel(this.pickups, command.id);
      await this.pickups.remove(command.id);
      await this.events.publishTraced(new PickupAddressRemovedEvent(command.id, label));
    });
  }
}
