import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrdersToReconcileDeliveryNotes } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { RemainderNoteNotFoundError } from "../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";
import { PrepareRemainderNoteCommand } from "./prepare-remainder-note.command.js";

/**
 * **Prêt par envoi** (plan E7 reliquat, choix 4, lot L4a) : le BL d'un
 * reliquat avance seul, sans toucher la commande — `orders.ready_at` et
 * `status = ready` restent ceux du rang 1 (choix 3).
 *
 * L'arbitrage est celui des autres écrivains du BL : le verrou de la
 * COMMANDE d'abord (`lockProgressOf`), puis le BL relu et avancé par
 * l'agrégat. Deux livraisons concurrentes du même fait se sérialisent sur ce
 * verrou ; la seconde trouve le BL préparé et ne fait rien.
 *
 * Idempotent comme `MarkOrderReadyHandler` : un BL déjà préparé ou remis est
 * un succès sans effet (réannonce, rejeu). Un BL annulé refuse (`prepare`
 * lève) et un BL absent aussi : ce sont de vraies divergences, qu'un message
 * mort sur la carte de santé doit montrer, et qu'on rejoue après correction.
 *
 * @sans-journal la trace est l'état du BL (`prepared_at`) ; le fait
 *   `order.ready` du reliquat et son courriel sont le lot L4d (choix 17).
 */
@CommandHandler(PrepareRemainderNoteCommand)
export class PrepareRemainderNoteHandler implements ICommandHandler<
  PrepareRemainderNoteCommand,
  void
> {
  constructor(
    private readonly orders: OrdersToReconcileDeliveryNotes,
    private readonly notes: DeliveryNoteRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PrepareRemainderNoteCommand): Promise<void> {
    await this.uow.run(async () => {
      if ((await this.orders.lockProgressOf(command.orderId)) === null) {
        throw new RemainderNoteNotFoundError(command.orderId, command.rank);
      }
      const notes = await this.notes.loadForOrders([command.orderId]);
      // Le vivant de ce rang d'abord ; à défaut un annulé, que `prepare` refusera.
      const ofRank = notes.filter((candidate) => candidate.rank === command.rank);
      const note = ofRank.find((candidate) => candidate.isLive) ?? ofRank[0];
      if (note === undefined) {
        throw new RemainderNoteNotFoundError(command.orderId, command.rank);
      }
      if (note.status === "prepared" || note.status === "handed_over") {
        return;
      }
      note.prepare(command.packedAt);
      await this.notes.save(note);
    });
  }
}
