import { statementMonthSchema, type InvoiceDossierView } from "@lfd/contracts";
import { Controller, Get, Header, Param, Query, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import type { InvoiceDossierFile } from "../application/queries/export-invoice-dossier.handler.js";
import {
  ExportInvoiceDossierQuery,
  GetInvoiceDossierQuery,
  type InvoiceDossierSheet,
} from "../application/queries/invoice-dossier-queries.js";

/** `?month=AAAA-MM`, facultatif : la même forme que le relevé, dont le dossier prend le périmètre. */
const monthQuerySchema = statementMonthSchema.optional();

/**
 * Surface **staff** du dossier de facturation simulé (plan
 * `plan-simulateur-dossier-de-facturation.md`, DF2).
 *
 * `b2b_accounting:read` seulement, déduit du verbe : le dossier vit dans
 * l'espace Comptabilité, et à la différence du relevé il n'est pas affiché dans
 * la fiche client. `404` si la société n'existe pas, `400` pour un mois mal
 * formé ou futur, `409` quand un bon figé empêche le calcul (surtaxe sans taux,
 * taux illisible) — le message nomme le bon.
 */
@Controller("admin/accounting/invoice-dossiers")
@AdminSurface("b2b_accounting")
export class AdminInvoiceDossiersController {
  constructor(private readonly queries: QueryBus) {}

  @Get("companies/:companyId")
  async dossier(
    @Param("companyId") companyId: string,
    @Query("month", new ZodQuery(monthQuerySchema)) month: string | undefined,
  ): Promise<InvoiceDossierView> {
    return this.queries.execute<GetInvoiceDossierQuery, InvoiceDossierView>(
      new GetInvoiceDossierQuery(companyId, month),
    );
  }

  /** La facture simulée : lignes, remises, frais, ventilation par taux. */
  @Get("companies/:companyId/invoice.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async invoice(
    @Param("companyId") companyId: string,
    @Query("month", new ZodQuery(monthQuerySchema)) month: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return this.export(companyId, month, "invoice", response);
  }

  /** Les bons, un par ligne, et ce que le calendrier en dit. */
  @Get("companies/:companyId/orders.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async orders(
    @Param("companyId") companyId: string,
    @Query("month", new ZodQuery(monthQuerySchema)) month: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return this.export(companyId, month, "orders", response);
  }

  /** Les écarts, terme par terme, et leur somme. */
  @Get("companies/:companyId/gaps.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async gaps(
    @Param("companyId") companyId: string,
    @Query("month", new ZodQuery(monthQuerySchema)) month: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return this.export(companyId, month, "gaps", response);
  }

  private async export(
    companyId: string,
    month: string | undefined,
    sheet: InvoiceDossierSheet,
    response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportInvoiceDossierQuery, InvoiceDossierFile>(
      new ExportInvoiceDossierQuery(companyId, month, sheet),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "DOSSIER-SIMULE.csv")),
    );
    return file.csv;
  }
}
