import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrdersToReconcileDeliveryNotes } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";
import { RecordDeliveryNotePrintCommand } from "./record-delivery-note-print.command.js";

const PRINTED = "delivery_note.printed";
const ORDER_SUBJECT = "order";

/**
 * Trace la dernière impression d'un BL (plan E6, § 14) : la version du
 * contenu imprimée, l'instant, l'auteur. Sous le verrou de la COMMANDE, comme
 * les autres écrivains du BL (commande, puis BL) : une réécriture concurrente
 * ne perd pas sa version.
 *
 * Un BL introuvable n'est pas une erreur ici : la lecture du PDF a déjà
 * répondu 404 avant que ce geste parte.
 *
 * La colonne `printed_*` garde la DERNIÈRE impression ; l'historique de la
 * commande les garde TOUTES (`documentation/commandes/reliquat/reliquat.md`, § 7) : le fait
 * `delivery_note.printed`, dans la même transaction, sous la clé
 * `delivery_note.printed:<bon>:<version>:<instant>` — qui et quand viennent
 * du contexte.
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
    private readonly journal: Journal,
  ) {}

  async execute(command: RecordDeliveryNotePrintCommand): Promise<void> {
    await this.uow.run(async () => {
      const order = await this.orders.lockProgressOf(command.orderId);
      if (order === null) {
        return;
      }
      const notes = await this.notes.loadForOrders([command.orderId]);
      const note = notes.find((candidate) => candidate.number === command.noteNumber);
      if (note === undefined) {
        return;
      }
      const printedAt = this.clock.now();
      note.recordPrint(printedAt, command.staffUserId);
      await this.notes.save(note);
      const { id, contentVersion = 1 } = note.toState();
      await this.journal.append({
        type: PRINTED,
        subjectType: ORDER_SUBJECT,
        subjectId: command.orderId,
        payload: { subjectLabel: order.orderNumber, noteNumber: note.number, contentVersion },
        occurredAt: printedAt,
        idempotencyKey: `${PRINTED}:${id}:${String(contentVersion)}:${printedAt.toISOString()}`,
      });
    });
  }
}
