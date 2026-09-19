import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { PickupAddressCreatedEvent } from "../domain/pickup-address.events.js";
import {
  PickupAddressRepository,
  type PickupAddressWrite,
} from "../domain/pickup-address.repository.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { CreatePickupAddressCommand } from "./create-pickup-address.command.js";

/**
 * Handler **staff** : crée un point de retrait. Mince : il délègue au
 * repository, qui tient les invariants (un seul défaut, au moins un point), et
 * à `PickupDiscount`, qui refuse une remise sans clientèle. Le mur est
 * l'`AdminAuthGuard` sur la route.
 */
@CommandHandler(CreatePickupAddressCommand)
export class CreatePickupAddressHandler implements ICommandHandler<
  CreatePickupAddressCommand,
  string
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreatePickupAddressCommand): Promise<string> {
    const { discount, discountAudiences, ...fields } = command.payload;
    const point: PickupAddressWrite = {
      ...fields,
      discount: PickupDiscount.of(discount, discountAudiences),
    };
    return await this.uow.run(async () => {
      const pickupId = await this.pickups.create(point);
      await this.events.publishTraced(new PickupAddressCreatedEvent(pickupId, point));
      return pickupId;
    });
  }
}
