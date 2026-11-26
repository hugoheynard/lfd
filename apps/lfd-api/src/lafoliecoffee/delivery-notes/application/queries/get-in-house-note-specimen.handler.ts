import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { renderClientNotePdf } from "../../domain/services/delivery-note-pdf.js";
import { clientNoteOf } from "../../domain/services/delivery-note-sheet.js";
import { specimenDeliveryNote } from "../document-specimens/specimen-delivery-note.js";
import type { DeliveryNotePdf } from "../services/delivery-note-documents.js";
import { GetInHouseNoteSpecimenQuery } from "./get-in-house-note-specimen.query.js";

/** Rend le BL interne d'exemple : le BL pro d'exemple, réglé `in_house`. */
@QueryHandler(GetInHouseNoteSpecimenQuery)
export class GetInHouseNoteSpecimenHandler implements IQueryHandler<
  GetInHouseNoteSpecimenQuery,
  DeliveryNotePdf
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<DeliveryNotePdf> {
    const { note, head, billing } = specimenDeliveryNote(this.clock.now());
    const inHouse = { ...billing, money: { ...billing.money, settlement: "in_house" as const } };
    const bytes = await renderClientNotePdf(clientNoteOf(note, head, inHouse), {
      logo: await this.logo.load(),
    });
    return { bytes, fileName: "exemple-bon-de-livraison-interne.pdf" };
  }
}
