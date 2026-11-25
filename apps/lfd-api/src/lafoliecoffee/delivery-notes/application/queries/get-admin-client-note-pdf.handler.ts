import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  deliveryNotePdfFileName,
  renderClientNotePdf,
} from "../../domain/services/delivery-note-pdf.js";
import {
  type DeliveryNotePdf,
  DeliveryNoteDocuments,
} from "../services/delivery-note-documents.js";
import { GetAdminClientNotePdfQuery } from "./get-admin-client-note-pdf.query.js";

/**
 * Le BL chiffré **pour l'équipe** — le même que celui du client, sans mur de
 * société : `@AdminSurface` a déjà décidé.
 */
@QueryHandler(GetAdminClientNotePdfQuery)
export class GetAdminClientNotePdfHandler implements IQueryHandler<
  GetAdminClientNotePdfQuery,
  DeliveryNotePdf
> {
  constructor(private readonly documents: DeliveryNoteDocuments) {}

  async execute(query: GetAdminClientNotePdfQuery): Promise<DeliveryNotePdf> {
    const { note, undelivered } = await this.documents.clientNote(query.orderId, query.noteNumber);
    const bytes = await renderClientNotePdf(note, await this.documents.art(), undelivered);
    return { bytes, fileName: deliveryNotePdfFileName(note) };
  }
}
