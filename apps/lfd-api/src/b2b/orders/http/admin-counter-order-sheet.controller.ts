import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetAdminOrderSheetPdfQuery } from "../application/queries/get-admin-order-sheet-pdf.query.js";
import type { OrderSheetPdf } from "../application/services/order-sheet-archive.service.js";

/**
 * **Le bon de commande, ouvert au comptoir** — le même document que celui du
 * client, chiffré (Hugo, 2026-11-03, option A).
 *
 * 🔴 Lève, pour ce document, la règle du 2026-09-11 « aucun montant au
 * comptoir » (`documentation/todos/todo-revue-retrait-boutique.md`, §1) : le
 * vendeur ouvre le bon que le client a reçu, et non une feuille de bureau. Il
 * n'y a toujours qu'UN bon de commande — la route admin (`b2b_orders`) et
 * celle-ci servent les mêmes octets, par la même requête et la même archive.
 *
 * Sous `handover_counter` — le droit du poste qui remet, que la route de
 * l'équipe Commandes ne lui donne pas. Ouvert dans le navigateur (`inline`) :
 * le comptoir le lit dans un dialogue, et l'imprime de là.
 */
@Controller("admin/counter/orders/:orderId")
@AdminSurface("handover_counter")
export class AdminCounterOrderSheetController {
  constructor(private readonly queries: QueryBus) {}

  @Get("bon.pdf")
  async bonPdf(
    @Param("orderId") orderId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetAdminOrderSheetPdfQuery, OrderSheetPdf>(
      new GetAdminOrderSheetPdfQuery(orderId),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "confirmation-de-commande.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
