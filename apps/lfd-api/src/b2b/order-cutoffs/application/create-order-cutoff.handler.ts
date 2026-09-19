import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderCutoffCreatedEvent } from "../domain/order-cutoff.events.js";
import { PickupAddressRepository } from "../../pickup-addresses/domain/pickup-address.repository.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import { cutoffPickupName } from "./cutoff-pickup-name.js";
import { CreateOrderCutoffCommand } from "./create-order-cutoff.command.js";

/**
 * Crée une **règle d'heure limite**. Aucune logique ici : la priorité entre
 * règles est une fonction pure du contrat (`resolveOrderCutoff`), et l'unicité
 * est tenue par la base. Le handler ne fait que passer le plat — et lit le nom
 * du point visé, pour que le fait le garde (D5 du plan des phrases).
 */
@CommandHandler(CreateOrderCutoffCommand)
export class CreateOrderCutoffHandler implements ICommandHandler<CreateOrderCutoffCommand, string> {
  constructor(
    private readonly repository: OrderCutoffRepository,
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateOrderCutoffCommand): Promise<string> {
    return await this.uow.run(async () => {
      const pickupName = await cutoffPickupName(this.pickups, command.payload.pickupAddressId);
      const cutoffId = await this.repository.create(command.payload);
      await this.events.publishTraced(
        new OrderCutoffCreatedEvent(cutoffId, command.payload, pickupName),
      );
      return cutoffId;
    });
  }
}
