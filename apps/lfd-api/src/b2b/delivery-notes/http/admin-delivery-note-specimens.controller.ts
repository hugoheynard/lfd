import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetCarrierNoteSpecimenQuery } from "../application/queries/get-carrier-note-specimen.query.js";
import { GetClientNoteSpecimenQuery } from "../application/queries/get-client-note-specimen.query.js";
import type { DeliveryNotePdf } from "../application/services/delivery-note-documents.js";

/**
 * **Les bons de livraison d'EXEMPLE** — la planche des documents
 * (`documentation/comptabilite/planche-des-documents.md`), sous
 * `b2b_accounting` en lecture comme ses voisins (plan E5a, § 3).
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminDeliveryNoteSpecimensController {
  constructor(private readonly queries: QueryBus) {}

  @Get("delivery-note-carrier.pdf")
  carrier(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetCarrierNoteSpecimenQuery(), response);
  }

  @Get("delivery-note-client-pro.pdf")
  client(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetClientNoteSpecimenQuery(), response);
  }

  private async serve(
    query: GetCarrierNoteSpecimenQuery | GetClientNoteSpecimenQuery,
    response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<typeof query, DeliveryNotePdf>(query);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-bon-de-livraison.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
