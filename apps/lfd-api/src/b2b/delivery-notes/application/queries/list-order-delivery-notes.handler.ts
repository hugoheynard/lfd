import type { StaffNote } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { staffNoteOf } from "../../domain/services/delivery-note-sheet.js";
import { DeliveryNoteDocuments } from "../services/delivery-note-documents.js";
import { ListOrderDeliveryNotesQuery } from "./list-order-delivery-notes.query.js";

/**
 * Les BL d'une commande, **pour l'équipe** : numéro, état, dates, montants.
 * Sans mur de société : `@AdminSurface` a déjà décidé, comme pour le bon.
 */
@QueryHandler(ListOrderDeliveryNotesQuery)
export class ListOrderDeliveryNotesHandler implements IQueryHandler<
  ListOrderDeliveryNotesQuery,
  readonly StaffNote[]
> {
  constructor(private readonly documents: DeliveryNoteDocuments) {}

  async execute(query: ListOrderDeliveryNotesQuery): Promise<readonly StaffNote[]> {
    const { head, billing } = await this.documents.order(query.orderId);
    const notes = await this.documents.listFor(query.orderId);
    return notes.map((note) => staffNoteOf(note, head, billing));
  }
}
