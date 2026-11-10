import {
  statementPayerSchema,
  statementPeriodSchema,
  type CycleStatementView,
  type StatementCyclesView,
} from "@lfd/contracts";
import { Controller, Get, Header, Param, Query, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import type { CycleStatementFile } from "../application/queries/export-cycle-statement.handler.js";
import {
  ExportCycleStatementQuery,
  GetCycleStatementQuery,
  ListStatementCyclesQuery,
} from "../application/queries/cycle-statement-queries.js";

/**
 * `?periodClosesAt=<ISO>`, facultatif : absent, c'est la période en cours. La
 * période suit le mode du payeur (M4a).
 */
const periodQuerySchema = statementPeriodSchema.optional();

/** `?companyId=<payeur>`, facultatif : absent, le calendrier de l'entité (M4a). */
const payerQuerySchema = statementPayerSchema.optional();

/**
 * Surface **staff** du relevé de cycle (plan `agregation-des-commandes`, A1).
 *
 * La lecture s'ouvre à `b2b_accounting:read` **ou** `b2b_companies:read` : le
 * relevé s'affiche dans la fiche client, que lisent aussi le support et le
 * commercial — sans qu'on leur donne pour autant l'espace comptable (§2 du
 * plan). L'**export**, lui, reste à la comptabilité seule : c'est un fichier
 * qui sort de l'écran.
 */
@Controller("admin/accounting/statements")
@AdminSurface("b2b_accounting")
export class AdminCycleStatementsController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Les périodes proposées au sélecteur, la plus récente d'abord — celles du
   * payeur `?companyId=`, sinon celles du calendrier de l'entité (M4a).
   */
  @Get("cycles")
  @RequireAnyPermission("b2b_accounting:read", "b2b_companies:read")
  async cycles(
    @Query("companyId", new ZodQuery(payerQuerySchema)) companyId: string | undefined,
  ): Promise<StatementCyclesView> {
    return this.queries.execute<ListStatementCyclesQuery, StatementCyclesView>(
      new ListStatementCyclesQuery(companyId ?? null),
    );
  }

  /**
   * Le relevé **provisoire** d'une société pour un cycle. `404` si la société
   * n'existe pas, `400` pour une clôture mal formée, qui n'en est pas une, ou une période pas encore commencée ;
   * `409` si plusieurs entités sont en service.
   */
  @Get("companies/:companyId")
  @RequireAnyPermission("b2b_accounting:read", "b2b_companies:read")
  async statement(
    @Param("companyId") companyId: string,
    @Query("periodClosesAt", new ZodQuery(periodQuerySchema)) periodClosesAt: string | undefined,
  ): Promise<CycleStatementView> {
    return this.queries.execute<GetCycleStatementQuery, CycleStatementView>(
      new GetCycleStatementQuery(companyId, periodClosesAt),
    );
  }

  /** Le même relevé en CSV, une ligne par commande. Le nom porte « PROVISOIRE ». */
  @Get("companies/:companyId/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(
    @Param("companyId") companyId: string,
    @Query("periodClosesAt", new ZodQuery(periodQuerySchema)) periodClosesAt: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportCycleStatementQuery, CycleStatementFile>(
      new ExportCycleStatementQuery(companyId, periodClosesAt),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "RELEVE-PROVISOIRE.csv")),
    );
    return file.csv;
  }
}
