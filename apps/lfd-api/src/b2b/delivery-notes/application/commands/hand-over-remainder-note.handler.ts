import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrdersToReconcileDeliveryNotes } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { HandedOverRemainderNoteNotFoundError } from "../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";
import { remainderNoteOf } from "../services/remainder-note-of.js";
import { HandOverRemainderNoteCommand } from "./hand-over-remainder-note.command.js";

/**
 * **Remis par envoi** (plan E7 reliquat, choix 3, lot L4b) : le BL d'un
 * reliquat passe `handed_over` seul. La commande reste celle du rang 1
 * jusqu'à L5 (`partially_handed_over`, solde dérivé) : ni statut, ni
 * `handed_over_at`, ni facture, ni `order.fulfilled` — donc ni points ni
 * solde.
 *
 * Même arbitrage que `PrepareRemainderNoteHandler` : le verrou de la
 * COMMANDE d'abord (`lockProgressOf`), puis l'agrégat (`handOver`). Un BL
 * déjà remis est un succès sans effet (réannonce, rejeu) ; un BL absent ou
 * annulé refuse — un message mort, rejouable après correction.
 *
 * Le jour de réception est le jour de Paris de l'instant du retrait. La
 * règle de la facture (`receivedOnOf`) préfère le jour de la tournée pour une
 * remise à la porte ; un arrêt de reliquat n'existe pas avant L7/L8
 * (`DeliveryRound.assign` pose le rang 1, vérifié le 2026-10-26), et ce
 * reliquat ne peut donc avoir été remis qu'au comptoir.
 *
 * @sans-journal la trace est l'état du BL (`handed_over_at`) et
 *   l'attestation du retrait ; le fait de la commande soldée est L5.
 */
@CommandHandler(HandOverRemainderNoteCommand)
export class HandOverRemainderNoteHandler implements ICommandHandler<
  HandOverRemainderNoteCommand,
  void
> {
  constructor(
    private readonly orders: OrdersToReconcileDeliveryNotes,
    private readonly notes: DeliveryNoteRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: HandOverRemainderNoteCommand): Promise<void> {
    await this.uow.run(async () => {
      if ((await this.orders.lockProgressOf(command.orderId)) === null) {
        throw new HandedOverRemainderNoteNotFoundError(command.orderId, command.rank);
      }
      const note = remainderNoteOf(await this.notes.loadForOrders([command.orderId]), command.rank);
      if (note === undefined) {
        throw new HandedOverRemainderNoteNotFoundError(command.orderId, command.rank);
      }
      if (note.status === "handed_over") {
        return;
      }
      note.handOver(command.handedOverAt, instantToLocal(command.handedOverAt).day);
      await this.notes.save(note);
    });
  }
}
