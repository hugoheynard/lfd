import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderReferenceNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderShortfallRepository } from "../../domain/ports/order-shortfall.repository.js";
import { ClearOrderShortfallCommand } from "./clear-order-shortfall.command.js";

/**
 * **Le manque signalé est levé** : le bac s'est fermé complet (lot E6a).
 *
 * Seul appelant : l'abonné durable `OnPackingShortfallCleared`. Un effacement
 * plus ancien que le signalement en vigueur est sans effet.
 *
 * @sans-journal comme `RecordOrderShortfallHandler`.
 *
 * @throws {OrderReferenceNotFoundError} la référence ne désigne aucune commande.
 */
@CommandHandler(ClearOrderShortfallCommand)
export class ClearOrderShortfallHandler implements ICommandHandler<
  ClearOrderShortfallCommand,
  void
> {
  constructor(
    private readonly shortfalls: OrderShortfallRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ClearOrderShortfallCommand): Promise<void> {
    await this.uow.run(async () => {
      const shortfall = await this.shortfalls.lock(command.reference, command.rank);
      if (shortfall === null) {
        throw new OrderReferenceNotFoundError(command.reference);
      }
      if (shortfall.clear(command.clearedAt)) {
        await this.shortfalls.save(shortfall);
      }
    });
  }
}
