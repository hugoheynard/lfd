import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";

import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeRepository } from "../domain/order-late-fee.repository.js";
import {
  ClearOrderLateFeeCommand,
  ReadOrderLateFeeQuery,
  SaveOrderLateFeeCommand,
} from "./order-late-fee.commands.js";

/**
 * **Pose** la surtaxe. L'auteur vient de la requête, jamais du corps : un
 * montant sans auteur ne se relit pas, et laisser l'appelant nommer quelqu'un
 * d'autre rendrait la trace inutile.
 */
@CommandHandler(SaveOrderLateFeeCommand)
export class SaveOrderLateFeeHandler implements ICommandHandler<SaveOrderLateFeeCommand, void> {
  constructor(private readonly fees: OrderLateFeeRepository) {}

  async execute(command: SaveOrderLateFeeCommand): Promise<void> {
    await this.fees.save(command.setting, command.updatedBy);
  }
}

@CommandHandler(ClearOrderLateFeeCommand)
export class ClearOrderLateFeeHandler implements ICommandHandler<ClearOrderLateFeeCommand, void> {
  constructor(private readonly fees: OrderLateFeeRepository) {}

  async execute(): Promise<void> {
    await this.fees.clear();
  }
}

@QueryHandler(ReadOrderLateFeeQuery)
export class ReadOrderLateFeeHandler implements IQueryHandler<
  ReadOrderLateFeeQuery,
  LateFeeSetting | null
> {
  constructor(private readonly fees: OrderLateFeeRepository) {}

  async execute(): Promise<LateFeeSetting | null> {
    return this.fees.read();
  }
}
