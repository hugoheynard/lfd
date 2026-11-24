import { type CreatedIdResponse, productionBatchQuerySchema } from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from "@nestjs/common";
import type { StreamableFile } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";
import { type ProductionPaper, servePaper } from "../../shared/print/index.js";
import { DrawProvisionalPrintCommand } from "../application/commands/draw-provisional-print.command.js";
import {
  GetPrintOptionsQuery,
  type ProductionPrintOptionsView,
} from "../application/queries/get-print-options.query.js";
import { GetProvisionalPrintPdfQuery } from "../application/queries/get-provisional-print-pdf.query.js";
import {
  type ProvisionalPrintPayload,
  provisionalChoiceOf,
  provisionalPrintPayloadSchema,
} from "./provisional-print.payload-schema.js";

const DAY = new ZodParam(productionBatchQuerySchema.shape.date, "date");

/**
 * **La fenêtre d'impression du dossier** (plan
 * `documentation/fournil/plan-impression-provisoire.md`, § 4) : son état,
 * l'impression provisoire avant l'arrêt, et le PDF de chaque impression.
 *
 * Sous `production_plan`, la surface du bouton « Imprimer le dossier ». Le
 * tirage provisoire demande la **lecture** (`production_plan:read`), comme le
 * dossier figé : il écrit un numéro d'impression, pas le plan, et qui peut
 * imprimer le dossier peut en imprimer l'aperçu. Il n'injecte que les bus.
 */
@Controller("admin/production")
@AdminSurface("production_plan")
export class ProvisionalPrintController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** L'état de la fenêtre : arrêté ou non, rayons ou postes, commandes, impressions. */
  @Get("batch/:date/print-options")
  printOptions(@Param("date", DAY) date: string): Promise<ProductionPrintOptionsView> {
    return this.queries.execute<GetPrintOptionsQuery, ProductionPrintOptionsView>(
      new GetPrintOptionsQuery(date),
    );
  }

  /**
   * **Tire une impression provisoire** : un numéro de la journée, le PDF
   * rangé, et l'identifiant rendu — le PDF se lit ensuite par la route
   * suivante. Par intention : un double clic ne tire pas deux numéros.
   */
  @Post("batch/:date/provisional-print")
  @RequirePermission("production_plan:read")
  @HttpCode(HttpStatus.CREATED)
  async draw(
    @Param("date", DAY) date: string,
    @Body(new ZodBody(provisionalPrintPayloadSchema)) payload: ProvisionalPrintPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<DrawProvisionalPrintCommand, string>(
      new DrawProvisionalPrintCommand(date, provisionalChoiceOf(payload), staffUserId, intentKey),
    );
    return { id };
  }

  /** Le PDF d'une impression provisoire, tel qu'il a été rangé au tirage. */
  @Get("batch/:date/provisional-print/:id.pdf")
  async pdf(
    @Param("date", DAY) date: string,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return servePaper(
      response,
      await this.queries.execute<GetProvisionalPrintPdfQuery, ProductionPaper>(
        new GetProvisionalPrintPdfQuery(date, id),
      ),
    );
  }
}
