import type { OrderCutoffView } from "@lfd/contracts";
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";

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
  constructor(private readonly repository: OrderCutoffRepository) {}

  async execute(command: CreateOrderCutoffCommand): Promise<string> {
    return this.repository.create(command.payload);
  }
}

@CommandHandler(UpdateOrderCutoffCommand)
export class UpdateOrderCutoffHandler implements ICommandHandler<UpdateOrderCutoffCommand, void> {
  constructor(private readonly repository: OrderCutoffRepository) {}

  async execute(command: UpdateOrderCutoffCommand): Promise<void> {
    await this.repository.update(command.id, command.payload);
  }
}

@CommandHandler(RemoveOrderCutoffCommand)
export class RemoveOrderCutoffHandler implements ICommandHandler<RemoveOrderCutoffCommand, void> {
  constructor(private readonly repository: OrderCutoffRepository) {}

  async execute(command: RemoveOrderCutoffCommand): Promise<void> {
    await this.repository.remove(command.id);
  }
}
