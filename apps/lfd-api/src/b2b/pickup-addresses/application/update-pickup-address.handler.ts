import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { PickupAddressUpdatedEvent } from "../domain/pickup-address.events.js";
import {
  PickupAddressRepository,
  type PickupAddressWrite,
} from "../domain/pickup-address.repository.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { UpdatePickupAddressCommand } from "./update-pickup-address.command.js";

/**
 * Handler **staff** : modifie un point de retrait. Mince : il délègue au
 * repository, qui tient les invariants (un seul défaut, au moins un point), et
 * à `PickupDiscount`, qui refuse une remise sans clientèle. Le mur est
 * l'`AdminAuthGuard` sur la route.
 */
@CommandHandler(UpdatePickupAddressCommand)
export class UpdatePickupAddressHandler implements ICommandHandler<
  UpdatePickupAddressCommand,
  void
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Clientèles absentes = celles de la base, relues DANS la transaction : la
   * règle se juge sur l'état qui sera écrit, pas sur la seule charge. Une
   * réduction posée sans cases sur un point dont les deux sont décochées est
   * donc refusée, et non enregistrée pour personne.
   *
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {PickupDiscountWithoutAudienceError} la remise ne vise personne.
   */
  async execute(command: UpdatePickupAddressCommand): Promise<void> {
    const { discount, discountAudiences, ...fields } = command.payload;
    await this.uow.run(async () => {
      const current = await this.pickups.resolve(command.id);
      if (current === null) {
        throw new PickupAddressNotFoundError(command.id);
      }
      const point: PickupAddressWrite = {
        ...fields,
        discount: PickupDiscount.of(discount, discountAudiences ?? current.discountAudiences),
      };
      await this.pickups.update(command.id, point);
      await this.events.publishTraced(new PickupAddressUpdatedEvent(command.id, point));
    });
  }
}
