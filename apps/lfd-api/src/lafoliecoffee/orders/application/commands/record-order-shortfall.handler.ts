import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderReferenceNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderShortfallRepository } from "../../domain/ports/order-shortfall.repository.js";
import { ShortfallBell } from "../services/shortfall-bell.js";
import { RecordOrderShortfallCommand } from "./record-order-shortfall.command.js";

/**
 * **La commande porte le manque signalé** — « décision attendue » (lot E6a,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3).
 *
 * Seul appelant : l'abonné durable `OnPackingShortfallReported`. L'agrégat
 * garde le plus récent : un fait en retard est un succès sans effet. Un
 * signalement retenu sonne la cloche de qui décide (`ShortfallBell`), après
 * validation.
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
    private readonly bell: ShortfallBell,
  ) {}

  async execute(command: RecordOrderShortfallCommand): Promise<void> {
    await this.uow.run(async () => {
      const shortfall = await this.shortfalls.lock(command.reference, command.rank);
      if (shortfall === null) {
        throw new OrderReferenceNotFoundError(command.reference);
      }
      if (shortfall.report(command.reportedAt, command.lines)) {
        await this.shortfalls.save(shortfall);
        // D8 : qui décide l'apprend, après validation — un fait en retard ou
        // rejoué ne change rien, et ne sonne donc pas.
        this.bell.ringAfterCommit({
          orderId: shortfall.orderId,
          rank: shortfall.rank,
          reference: shortfall.reference,
          reportedAt: command.reportedAt,
        });
      }
    });
  }
}
