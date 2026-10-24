import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { renderClientNotePdf } from "../../domain/services/delivery-note-pdf.js";
import { clientNoteOf } from "../../domain/services/delivery-note-sheet.js";
import { specimenDeliveryNote } from "../document-specimens/specimen-delivery-note.js";
import type { DeliveryNotePdf } from "../services/delivery-note-documents.js";
import { GetClientNoteSpecimenQuery } from "./get-client-note-specimen.query.js";

/** Rend le BL chiffré (pro) d'exemple par le rendu même des vrais BL. */
@QueryHandler(GetClientNoteSpecimenQuery)
export class GetClientNoteSpecimenHandler implements IQueryHandler<
  GetClientNoteSpecimenQuery,
  DeliveryNotePdf
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<DeliveryNotePdf> {
    const { note, head, billing } = specimenDeliveryNote(this.clock.now());
    const bytes = await renderClientNotePdf(clientNoteOf(note, head, billing), {
      logo: await this.logo.load(),
    });
    return { bytes, fileName: "exemple-bon-de-livraison-client-pro.pdf" };
  }
}
