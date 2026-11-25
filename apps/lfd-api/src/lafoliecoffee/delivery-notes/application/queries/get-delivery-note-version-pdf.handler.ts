import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryNoteVersionNotKeptError } from "../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteVersionRenderedReader } from "../../domain/ports/delivery-note-versions.reader.js";
import {
  deliveryNotePdfFileName,
  renderClientNotePdf,
} from "../../domain/services/delivery-note-pdf.js";
import {
  type DeliveryNotePdf,
  DeliveryNoteDocuments,
} from "../services/delivery-note-documents.js";
import { GetDeliveryNoteVersionPdfQuery } from "./get-delivery-note-version-pdf.query.js";

/**
 * **Une version figée du BL client, en PDF** (plan du reliquat, § 5 ter) :
 * rendue de l'entrée rangée seule — rien n'est relu sur la commande ni sur
 * les bons frères, qui ont pu changer depuis. Le bon est cherché dans SA
 * commande : un numéro d'une autre commande répond 404. Sans mur de
 * société : `@AdminSurface` a déjà décidé.
 *
 * @throws {DeliveryNoteNotFoundError} @throws {DeliveryNoteVersionNotKeptError}
 */
@QueryHandler(GetDeliveryNoteVersionPdfQuery)
export class GetDeliveryNoteVersionPdfHandler implements IQueryHandler<
  GetDeliveryNoteVersionPdfQuery,
  DeliveryNotePdf
> {
  constructor(
    private readonly documents: DeliveryNoteDocuments,
    private readonly versions: DeliveryNoteVersionRenderedReader,
  ) {}

  async execute(query: GetDeliveryNoteVersionPdfQuery): Promise<DeliveryNotePdf> {
    const state = await this.documents.note(query.orderId, query.noteNumber);
    const rendered = await this.versions.renderedOf(state.id, query.version);
    if (rendered === null) {
      throw new DeliveryNoteVersionNotKeptError(state.number, query.version);
    }
    const bytes = await renderClientNotePdf(
      rendered.note,
      await this.documents.art(),
      rendered.undelivered,
    );
    return {
      bytes,
      fileName: versionFileName(deliveryNotePdfFileName(rendered.note), query.version),
    };
  }
}

/** `BL-13-1.pdf` → `BL-13-1-v1.pdf` : deux versions téléchargées ne s'écrasent pas. */
function versionFileName(fileName: string, version: number): string {
  const suffix = `-v${String(version)}`;
  return fileName.endsWith(".pdf")
    ? `${fileName.slice(0, -4)}${suffix}.pdf`
    : `${fileName}${suffix}`;
}
