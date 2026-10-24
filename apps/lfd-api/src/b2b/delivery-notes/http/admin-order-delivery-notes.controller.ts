import type { StaffNote } from "@lfd/contracts";
import {
  contentDispositionAttachment,
  contentDispositionInline,
  sanitiseFileName,
} from "@lfd/storage";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetAdminClientNotePdfQuery } from "../application/queries/get-admin-client-note-pdf.query.js";
import { GetCarrierNotePdfQuery } from "../application/queries/get-carrier-note-pdf.query.js";
import { ListOrderDeliveryNotesQuery } from "../application/queries/list-order-delivery-notes.query.js";
import type { DeliveryNotePdf } from "../application/services/delivery-note-documents.js";

/**
 * **Les bons de livraison d'une commande, vus de l'équipe** (plan
 * `documentation/commandes/plan-e5a-le-bon-de-livraison-imprime.md`, § 3) :
 * la liste dans la fiche commande, le BL de transport à imprimer, le BL
 * chiffré à télécharger.
 *
 * Sous `b2b_orders` en lecture — le droit qui ouvre déjà la fiche et son bon
 * de commande. Aucune ressource neuve. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/orders/:orderId/delivery-notes")
@AdminSurface("b2b_orders")
export class AdminOrderDeliveryNotesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(@Param("orderId") orderId: string): Promise<readonly StaffNote[]> {
    return this.queries.execute<ListOrderDeliveryNotesQuery, readonly StaffNote[]>(
      new ListOrderDeliveryNotesQuery(orderId),
    );
  }

  /** Le BL de transport, ouvert dans le navigateur pour l'imprimer. Aucun montant. */
  @Get(":number/carrier.pdf")
  async carrierPdf(
    @Param("orderId") orderId: string,
    @Param("number") number: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetCarrierNotePdfQuery, DeliveryNotePdf>(
      new GetCarrierNotePdfQuery(orderId, number),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "bon-de-livraison.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }

  /** Le BL chiffré, téléchargé — le même que celui du client. */
  @Get(":number/client.pdf")
  async clientPdf(
    @Param("orderId") orderId: string,
    @Param("number") number: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetAdminClientNotePdfQuery, DeliveryNotePdf>(
      new GetAdminClientNotePdfQuery(orderId, number),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(pdf.fileName, "bon-de-livraison.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
