import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  deliveryNotePdfFileName,
  renderCarrierNotePdf,
} from "../../domain/services/delivery-note-pdf.js";
import { carrierNoteOf } from "../../domain/services/delivery-note-sheet.js";
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
    const { head } = await this.documents.order(query.orderId);
    const note = carrierNoteOf(await this.documents.note(query.orderId, query.noteNumber), head);
    const bytes = await renderCarrierNotePdf(note, await this.documents.art());
    return { bytes, fileName: deliveryNotePdfFileName(note) };
  }
}
