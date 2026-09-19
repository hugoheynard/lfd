import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderCutoffRemovedEvent } from "../domain/order-cutoff.events.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import { RemoveOrderCutoffCommand } from "./remove-order-cutoff.command.js";

/**
 * Retire une **règle d'heure limite**. Aucune logique ici : la priorité entre
 * règles est une fonction pure du contrat (`resolveOrderCutoff`), et l'unicité
 * est tenue par la base. Le handler ne fait que passer le plat.
 */
@CommandHandler(RemoveOrderCutoffCommand)
export class RemoveOrderCutoffHandler implements ICommandHandler<RemoveOrderCutoffCommand, void> {
  constructor(
    private readonly repository: OrderCutoffRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveOrderCutoffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.repository.remove(command.id);
      await this.events.publishTraced(new OrderCutoffRemovedEvent(command.id));
    });
  }
}
