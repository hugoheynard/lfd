import type { OrderCutoffView } from "@lfd/contracts";
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  OrderCutoffCreatedEvent,
  OrderCutoffRemovedEvent,
  OrderCutoffUpdatedEvent,
} from "../domain/order-cutoff.events.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import {
  CreateOrderCutoffCommand,
  ListOrderCutoffsQuery,
  RemoveOrderCutoffCommand,
  UpdateOrderCutoffCommand,
} from "./order-cutoff.commands.js";

/**
 * CRUD des **règles d'heure limite**. Aucune logique ici : la priorité entre
 * règles est une fonction pure du contrat (`resolveOrderCutoff`), et l'unicité
 * est tenue par la base. Les handlers ne font que passer le plat.
 */
@QueryHandler(ListOrderCutoffsQuery)
export class ListOrderCutoffsHandler implements IQueryHandler<
  ListOrderCutoffsQuery,
  readonly OrderCutoffView[]
> {
  constructor(private readonly repository: OrderCutoffRepository) {}

  async execute(): Promise<readonly OrderCutoffView[]> {
    return this.repository.list();
  }
}

@CommandHandler(CreateOrderCutoffCommand)
export class CreateOrderCutoffHandler implements ICommandHandler<CreateOrderCutoffCommand, string> {
  constructor(
    private readonly repository: OrderCutoffRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateOrderCutoffCommand): Promise<string> {
    return await this.uow.run(async () => {
      const cutoffId = await this.repository.create(command.payload);
      await this.events.publishTraced(new OrderCutoffCreatedEvent(cutoffId, command.payload));
      return cutoffId;
    });
  }
}

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
