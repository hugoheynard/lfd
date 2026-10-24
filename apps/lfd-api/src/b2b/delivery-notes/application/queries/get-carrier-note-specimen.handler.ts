import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { renderCarrierNotePdf } from "../../domain/services/delivery-note-pdf.js";
import { carrierNoteOf } from "../../domain/services/delivery-note-sheet.js";
import { specimenDeliveryNote } from "../document-specimens/specimen-delivery-note.js";
import type { DeliveryNotePdf } from "../services/delivery-note-documents.js";
import { GetCarrierNoteSpecimenQuery } from "./get-carrier-note-specimen.query.js";

/** Rend le BL de transport d'exemple par le rendu même des vrais BL. */
@QueryHandler(GetCarrierNoteSpecimenQuery)
export class GetCarrierNoteSpecimenHandler implements IQueryHandler<
  GetCarrierNoteSpecimenQuery,
  DeliveryNotePdf
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<DeliveryNotePdf> {
    const { note, head } = specimenDeliveryNote(this.clock.now());
    const bytes = await renderCarrierNotePdf(carrierNoteOf(note, head), {
      logo: await this.logo.load(),
    });
    return { bytes, fileName: "exemple-bon-de-livraison-transport.pdf" };
  }
}
