import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { SepaMandateSpecimenPdf } from "../application/queries/get-sepa-mandate-specimen.handler.js";
import { GetSepaMandateSpecimenQuery } from "../application/queries/get-sepa-mandate-specimen.query.js";

/**
 * **Les mandats SEPA d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`), sous
 * `b2b_accounting` en lecture comme les autres exemplaires de la planche.
 *
 * Deux routes, une par schéma : les deux mises en page n'ont rien en commun
 * que leurs zones, et l'une ne se contrôle pas en regardant l'autre. Il
 * n'injecte que le `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminSepaMandateSpecimensController {
  constructor(private readonly queries: QueryBus) {}

  @Get("sepa-mandate-b2b.pdf")
  b2bMandate(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetSepaMandateSpecimenQuery("B2B"), response);
  }

  @Get("sepa-mandate-core.pdf")
  coreMandate(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetSepaMandateSpecimenQuery("CORE"), response);
  }

  private async serve(
    query: GetSepaMandateSpecimenQuery,
    response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetSepaMandateSpecimenQuery, SepaMandateSpecimenPdf>(
      query,
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-mandat-sepa.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
