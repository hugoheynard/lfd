import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { GetClientNotePdfQuery } from "../application/queries/get-client-note-pdf.query.js";
import type { DeliveryNotePdf } from "../application/services/delivery-note-documents.js";

/**
 * **Le bon de livraison dans l'espace client** (plan E5a, § 3) : sur une
 * commande remise, le BL chiffré. Même mur que le bon de commande — une
 * commande d'une autre société rend un 404.
 */
@Controller("orders")
export class DeliveryNotesController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":orderId/delivery-note.pdf")
  async pdf(
    @CurrentUser() user: Principal,
    @Param("orderId") orderId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetClientNotePdfQuery, DeliveryNotePdf>(
      new GetClientNotePdfQuery(user.userId, orderId),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(pdf.fileName, "bon-de-livraison.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
