import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderCutoffRemovedEvent } from "../domain/order-cutoff.events.js";
import { PickupAddressRepository } from "../../pickup-addresses/domain/pickup-address.repository.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import { cutoffPickupName } from "./cutoff-pickup-name.js";
import { RemoveOrderCutoffCommand } from "./remove-order-cutoff.command.js";

/**
 * Retire une **règle d'heure limite**. Aucune logique ici : la priorité entre
 * règles est une fonction pure du contrat (`resolveOrderCutoff`), et l'unicité
 * est tenue par la base. Le handler ne fait que passer le plat — et le fait
 * garde la règle effacée, point nommé compris (lot B du plan des phrases).
 */
@CommandHandler(RemoveOrderCutoffCommand)
export class RemoveOrderCutoffHandler implements ICommandHandler<RemoveOrderCutoffCommand, void> {
  constructor(
    private readonly repository: OrderCutoffRepository,
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveOrderCutoffCommand): Promise<void> {
    await this.uow.run(async () => {
      const removed = await this.repository.remove(command.id);
      const pickupName = await cutoffPickupName(this.pickups, removed.pickupAddressId);
      await this.events.publishTraced(new OrderCutoffRemovedEvent(command.id, removed, pickupName));
    });
  }
}
