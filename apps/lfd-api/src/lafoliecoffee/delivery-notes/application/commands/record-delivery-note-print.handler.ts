import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrdersToReconcileDeliveryNotes } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";
import { RecordDeliveryNotePrintCommand } from "./record-delivery-note-print.command.js";

/**
 * Trace la dernière impression d'un BL (plan E6, § 14) : la version du
 * contenu imprimée, l'instant, l'auteur. Sous le verrou de la COMMANDE, comme
 * les autres écrivains du BL (commande, puis BL) : une réécriture concurrente
 * ne perd pas sa version.
 *
 * Un BL introuvable n'est pas une erreur ici : la lecture du PDF a déjà
 * répondu 404 avant que ce geste parte.
 *
 * @sans-journal la trace EST la colonne `printed_*` ; rien ne la lit au journal.
 */
@CommandHandler(RecordDeliveryNotePrintCommand)
export class RecordDeliveryNotePrintHandler implements ICommandHandler<
  RecordDeliveryNotePrintCommand,
  void
> {
  constructor(
    private readonly orders: OrdersToReconcileDeliveryNotes,
    private readonly notes: DeliveryNoteRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordDeliveryNotePrintCommand): Promise<void> {
    await this.uow.run(async () => {
      if ((await this.orders.lockProgressOf(command.orderId)) === null) {
        return;
      }
      const notes = await this.notes.loadForOrders([command.orderId]);
      const note = notes.find((candidate) => candidate.number === command.noteNumber);
      if (note === undefined) {
        return;
      }
      note.recordPrint(this.clock.now(), command.staffUserId);
      await this.notes.save(note);
    });
  }
}
