import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  deliveryNotePdfFileName,
  renderCarrierNotePdf,
} from "../../domain/services/delivery-note-pdf.js";
import { carrierNoteOf } from "../../domain/services/delivery-note-sheet.js";
import { undeliveredOf } from "../../domain/services/undelivered-lines.js";
import {
  type DeliveryNotePdf,
  DeliveryNoteDocuments,
} from "../services/delivery-note-documents.js";
import { GetCarrierNotePdfQuery } from "./get-carrier-note-pdf.query.js";

/** Imprime le BL qui voyage avec la marchandise — sans aucun montant. */
@QueryHandler(GetCarrierNotePdfQuery)
export class GetCarrierNotePdfHandler implements IQueryHandler<
  GetCarrierNotePdfQuery,
  DeliveryNotePdf
> {
  constructor(private readonly documents: DeliveryNoteDocuments) {}

  async execute(query: GetCarrierNotePdfQuery): Promise<DeliveryNotePdf> {
    const { owned, head } = await this.documents.order(query.orderId);
    const notes = await this.documents.listFor(query.orderId);
    const state = await this.documents.note(query.orderId, query.noteNumber);
    const note = carrierNoteOf(state, head);
    const undelivered = undeliveredOf(owned.view.lines, notes, state);
    const bytes = await renderCarrierNotePdf(note, await this.documents.art(), undelivered);
    return { bytes, fileName: deliveryNotePdfFileName(note) };
  }
}
