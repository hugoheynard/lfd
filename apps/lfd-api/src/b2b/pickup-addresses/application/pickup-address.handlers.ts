import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  DefaultPickupAddressSetEvent,
  PickupAddressCreatedEvent,
  PickupAddressRemovedEvent,
  PickupAddressUpdatedEvent,
} from "../domain/pickup-address.events.js";
import {
  PickupAddressRepository,
  type PickupAddressWrite,
} from "../domain/pickup-address.repository.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import {
  CreatePickupAddressCommand,
  RemovePickupAddressCommand,
  SetDefaultPickupAddressCommand,
  UpdatePickupAddressCommand,
} from "./pickup-address.commands.js";

/**
 * Handlers **staff** des points de retrait. Minces : ils délèguent au repository,
 * qui tient les invariants (un seul défaut, au moins un point), et à
 * `PickupDiscount`, qui refuse une remise sans clientèle. Le mur est
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
      await this.pickups.remove(command.id);
      await this.events.publishTraced(new PickupAddressRemovedEvent(command.id));
    });
  }
}

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
