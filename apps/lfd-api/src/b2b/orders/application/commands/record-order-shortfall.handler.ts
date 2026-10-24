import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderReferenceNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderShortfallRepository } from "../../domain/ports/order-shortfall.repository.js";
import { RecordOrderShortfallCommand } from "./record-order-shortfall.command.js";

/**
 * **La commande porte le manque signalé** — « décision attendue » (lot E6a,
 * `commandes/plan-e6-le-depart-incomplet.md` § 3).
 *
 * Seul appelant : l'abonné durable `OnPackingShortfallReported`. L'agrégat
 * garde le plus récent : un fait en retard est un succès sans effet.
 *
 * @sans-journal E6a n'écrit aucun fait au journal (le plan n'en nomme pas) ;
 * la décision d'E6b sera, elle, l'acte dont on répond.
 *
 * @throws {OrderReferenceNotFoundError} la référence ne désigne aucune commande.
 */
@CommandHandler(RecordOrderShortfallCommand)
export class RecordOrderShortfallHandler implements ICommandHandler<
  RecordOrderShortfallCommand,
  void
> {
  constructor(
    private readonly shortfalls: OrderShortfallRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordOrderShortfallCommand): Promise<void> {
    await this.uow.run(async () => {
      const shortfall = await this.shortfalls.lock(command.reference);
      if (shortfall === null) {
        throw new OrderReferenceNotFoundError(command.reference);
      }
      if (shortfall.report(command.reportedAt, command.lines)) {
        await this.shortfalls.save(shortfall);
      }
    });
  }
}
