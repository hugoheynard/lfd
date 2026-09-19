import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderCutoffUpdatedEvent } from "../domain/order-cutoff.events.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import { UpdateOrderCutoffCommand } from "./update-order-cutoff.command.js";

/**
 * Modifie une **règle d'heure limite**. Aucune logique ici : la priorité entre
 * règles est une fonction pure du contrat (`resolveOrderCutoff`), et l'unicité
 * est tenue par la base. Le handler ne fait que passer le plat.
 */
@CommandHandler(UpdateOrderCutoffCommand)
export class UpdateOrderCutoffHandler implements ICommandHandler<UpdateOrderCutoffCommand, void> {
  constructor(
    private readonly repository: OrderCutoffRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateOrderCutoffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.repository.update(command.id, command.payload);
      await this.events.publishTraced(new OrderCutoffUpdatedEvent(command.id, command.payload));
    });
  }
}
