import {
  myInvoicesArchiveQuerySchema,
  myInvoicesQuerySchema,
  type IssuedInvoiceView,
  type MyInvoicesArchiveQuery,
  type MyInvoicesQuery,
  type MyIssuedInvoicesView,
} from "@lfd/contracts";
import { Controller, Get, Param, Query, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import type { InvoiceArchive } from "../application/invoice-archive-support.js";
import type { InvoiceDocument } from "../application/invoice-document-support.js";
import {
  ExportMyCompanyInvoicesArchiveQuery,
  GetMyCompanyInvoiceDocumentQuery,
  GetMyCompanyInvoiceQuery,
  ListMyCompanyInvoicesQuery,
} from "../application/queries/issued-invoice-queries.js";
import { invoiceArchiveResponse, invoicePdfResponse } from "./invoice-pdf-response.js";
import { archiveSelectionOf } from "./invoice-archive-selection.js";

/**
 * Surface **client** de « Mes factures » (plan `facture-emise.md`) — la section de `/mon-compte`. Le mur (détenteur ou facturation ;
 * non-membre 404, autre rôle 403) vit dans les handlers.
 */
@Controller("companies")
export class CompanyInvoicesController {
  constructor(private readonly queries: QueryBus) {}

  /** La liste filtrée (émission, genre), chaque pièce avec son règlement, et le total dû du compte. */
  @Get(":companyId/invoices")
  list(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Query(new ZodQuery(myInvoicesQuerySchema)) query: MyInvoicesQuery,
  ): Promise<MyIssuedInvoicesView> {
    return this.queries.execute<ListMyCompanyInvoicesQuery, MyIssuedInvoicesView>(
      new ListMyCompanyInvoicesQuery(user.userId, companyId, {
        year: query.year ?? null,
        month: query.month ?? null,
        kind: query.kind ?? null,
      }),
    );
  }

  /**
   * Le zip des PDF (P2) : les pièces filtrées, ou une sélection d'`ids`.
   * Tout est lu et vérifié AVANT le premier en-tête : un refus sort par
   * `AppErrorFilter`, jamais un zip partiel en 200.
   */
  @Get(":companyId/invoices.zip")
  async archive(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Query(new ZodQuery(myInvoicesArchiveQuerySchema)) query: MyInvoicesArchiveQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const archive = await this.queries.execute<ExportMyCompanyInvoicesArchiveQuery, InvoiceArchive>(
      new ExportMyCompanyInvoicesArchiveQuery(user.userId, companyId, archiveSelectionOf(query)),
    );
    return invoiceArchiveResponse(archive, response);
  }

  @Get(":companyId/invoices/:invoiceId")
  read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("invoiceId") invoiceId: string,
  ): Promise<IssuedInvoiceView> {
    return this.queries.execute<GetMyCompanyInvoiceQuery, IssuedInvoiceView>(
      new GetMyCompanyInvoiceQuery(user.userId, companyId, invoiceId),
    );
  }

  /**
   * Le PDF/A-3 Factur-X rangé (E3b), en téléchargement : 404 nommé tant que
   * le rendu n'est pas fait. `attachment` toujours — une facture se garde.
   */
  @Get(":companyId/invoices/:invoiceId/pdf")
  async document(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("invoiceId") invoiceId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const document = await this.queries.execute<GetMyCompanyInvoiceDocumentQuery, InvoiceDocument>(
      new GetMyCompanyInvoiceDocumentQuery(user.userId, companyId, invoiceId),
    );
    return invoicePdfResponse(document, response);
  }
}
