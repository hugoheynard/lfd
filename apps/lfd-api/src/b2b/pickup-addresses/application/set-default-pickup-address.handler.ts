import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DefaultPickupAddressSetEvent } from "../domain/pickup-address.events.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { SetDefaultPickupAddressCommand } from "./set-default-pickup-address.command.js";

/**
 * Handler **staff** : désigne le point de retrait par défaut. Mince : il
 * délègue au repository, qui tient les invariants (un seul défaut, au moins un
 * point). Le mur est l'`AdminAuthGuard` sur la route.
 */
@CommandHandler(SetDefaultPickupAddressCommand)
export class SetDefaultPickupAddressHandler implements ICommandHandler<
  SetDefaultPickupAddressCommand,
  void
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetDefaultPickupAddressCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.pickups.setDefault(command.id);
      await this.events.publishTraced(new DefaultPickupAddressSetEvent(command.id));
    });
  }
}
