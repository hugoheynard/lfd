import {
  type DossierDispatchView,
  type PlanVersionDiffView,
  type PlanVersionDossierResendPayload,
  type PlanVersionRangeQuery,
  type PlanVersionView,
  planVersionDossierResendPayloadSchema,
  planVersionParamSchema,
  planVersionRangeQuerySchema,
  productionBatchQuerySchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodParam, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { type ProductionPaper, servePaper } from "../../shared/print/index.js";
import { ResendPlanVersionDossierCommand } from "../application/commands/resend-plan-version-dossier.command.js";
import {
  GetPlanVersionPaperQuery,
  type PlanVersionPaperKind,
} from "../application/queries/get-plan-version-paper.query.js";
import { ComparePlanVersionsQuery } from "../application/queries/compare-plan-versions.query.js";
import { ListDossierDispatchesQuery } from "../application/queries/list-dossier-dispatches.query.js";
import { ListPlanVersionsQuery } from "../application/queries/list-plan-versions.query.js";

const DAY = new ZodParam(productionBatchQuerySchema.shape.date, "date");
const VERSION = new ZodParam(planVersionParamSchema, "version");

/**
 * **Les versions du plan d'une journée** — la liste, la comparaison de deux
 * versions et les envois du dossier
 * (`documentation/fournil/les-versions-du-plan.md`).
 *
 * Même surface que le dossier du jour (`production_plan`, lecture) : qui
 * peut tirer le dossier peut lire son histoire, et rouvrir le papier rangé
 * d'une version passée. Le renvoi du dossier (lot H6) est sous le droit du
 * geste qui l'envoie déjà, l'arrêt (`production_count_stop:write`).
 */
@Controller("admin/production")
@AdminSurface("production_plan")
export class ProductionPlanVersionsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Les versions, de la première à la dernière ; vide pour une journée jamais versionnée. */
  @Get("batch/:date/plan-history")
  list(@Param("date", DAY) date: string): Promise<readonly PlanVersionView[]> {
    return this.queries.execute<ListPlanVersionsQuery, readonly PlanVersionView[]>(
      new ListPlanVersionsQuery(date),
    );
  }

  /**
   * Ce qui a changé de `from` à `to`. 400 sur une forme invalide ou un ordre
   * inversé, 404 sur une version que la journée n'a pas.
   */
  @Get("batch/:date/plan-history/compare")
  compare(
    @Param("date", DAY) date: string,
    @Query(new ZodQuery(planVersionRangeQuerySchema)) range: PlanVersionRangeQuery,
  ): Promise<PlanVersionDiffView> {
    return this.queries.execute<ComparePlanVersionsQuery, PlanVersionDiffView>(
      new ComparePlanVersionsQuery(date, range.from, range.to),
    );
  }

  /** Les destinataires du dossier, et la dernière version que chacun a reçue de la journée. */
  @Get("batch/:date/plan-history/dispatches")
  dispatches(@Param("date", DAY) date: string): Promise<readonly DossierDispatchView[]> {
    return this.queries.execute<ListDossierDispatchesQuery, readonly DossierDispatchView[]>(
      new ListDossierDispatchesQuery(date),
    );
  }

  /**
   * **Renvoyer le dossier de la version courante** — à une ligne de la liste,
   * ou à tous ceux qui ne sont pas à jour ; chacun reçoit ce qui a changé
   * depuis SA version. 204 : l'écran relit `…/dispatches`. Une fois par
   * intention : un double clic ne renvoie pas deux fois.
   */
  @Post("batch/:date/plan-history/resend")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("production_count_stop:write")
  async resend(
    @Param("date", DAY) date: string,
    @Body(new ZodBody(planVersionDossierResendPayloadSchema))
    payload: PlanVersionDossierResendPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    const target =
      payload.target === "recipient"
        ? { kind: "recipient" as const, recipientId: payload.recipientId }
        : { kind: "outdated" as const };
    await this.commands.execute<ResendPlanVersionDossierCommand, void>(
      new ResendPlanVersionDossierCommand(date, target, staffUserId, intentKey),
    );
  }

  /** Le dossier RANGÉ de cette version ; 404 s'il ne l'est pas — jamais refait. */
  @Get("batch/:date/plan-history/:version/dossier.pdf")
  dossier(
    @Param("date", DAY) date: string,
    @Param("version", VERSION) version: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.paper(date, version, "dossier", response);
  }

  /** Le compte à produire RANGÉ de cette version ; 404 s'il ne l'est pas. */
  @Get("batch/:date/plan-history/:version/compte-a-produire.pdf")
  count(
    @Param("date", DAY) date: string,
    @Param("version", VERSION) version: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.paper(date, version, "count", response);
  }

  private async paper(
    date: string,
    version: number,
    kind: PlanVersionPaperKind,
    response: Response,
  ): Promise<StreamableFile> {
    return servePaper(
      response,
      await this.queries.execute<GetPlanVersionPaperQuery, ProductionPaper>(
        new GetPlanVersionPaperQuery(date, version, kind),
      ),
    );
  }
}
