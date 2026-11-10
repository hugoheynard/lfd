import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetOrderSheetSpecimenQuery } from "../application/queries/get-order-sheet-specimen.query.js";
import type { OrderSheetPdf } from "../application/services/order-sheet-archive.service.js";

/**
 * **Les bons de commande d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Sous `b2b_accounting` en lecture, comme les autres exemplaires de la
 * planche, que chaque bloc sert sous ce même préfixe : la planche est un
 * écran de la Comptabilité, et un seul droit l'ouvre. Il n'injecte que le
 * `QueryBus`. Pas de bon « staff » : il n'en existe pas (cf. `bonPdf`).
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminOrderSheetSpecimensController {
  constructor(private readonly queries: QueryBus) {}

  @Get("order-sheet-pro.pdf")
  proSheet(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetOrderSheetSpecimenQuery("pro"), response);
  }

  @Get("order-sheet-public.pdf")
  publicSheet(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetOrderSheetSpecimenQuery("public"), response);
  }

  private async serve(
    query: GetOrderSheetSpecimenQuery,
    response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetOrderSheetSpecimenQuery, OrderSheetPdf>(query);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(
        sanitiseFileName(pdf.fileName, "exemple-confirmation-de-commande.pdf"),
      ),
    );
    return new StreamableFile(pdf.bytes);
  }
}
