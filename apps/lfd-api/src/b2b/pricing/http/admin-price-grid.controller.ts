import {
  priceGridExportPayloadSchema,
  priceGridQuestionSchema,
  type PriceGridExportPayload,
  type PriceGridPromotionsView,
  type PriceGridQuestion,
} from "@lfd/contracts";
import { Body, Controller, Header, HttpCode, HttpStatus, Post, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  ExportPriceGridQuery,
  type PriceGridFile,
} from "../application/queries/export-price-grid.query.js";
import { ListPriceGridPromotionsQuery } from "../application/queries/list-price-grid-promotions.query.js";

/**
 * **La grille de prix d'un public** — l'export d'une plaquette
 * (`plan-export-grille-de-prix.md`).
 *
 * Deux `POST` de LECTURE, sous `b2b_pricing:read` : la question (public,
 * jour, acheminement, remises retenues) est un objet, pas une adresse — et rien
 * n'est écrit. Le verbe déduirait l'écriture ; la permission est donc posée.
 */
@Controller("admin/pricing/price-grid")
@AdminSurface("b2b_pricing")
export class AdminPriceGridController {
  constructor(private readonly queries: QueryBus) {}

  /** Les promotions que ce public reçoit à ce jour et pour cet acheminement — de quoi remplir le panneau. */
  @Post("promotions")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("b2b_pricing:read")
  promotions(
    @Body(new ZodBody(priceGridQuestionSchema)) question: PriceGridQuestion,
  ): Promise<PriceGridPromotionsView> {
    return this.queries.execute<ListPriceGridPromotionsQuery, PriceGridPromotionsView>(
      new ListPriceGridPromotionsQuery(question),
    );
  }

  /** Le fichier : UTF-8 avec BOM, point-virgule, virgule décimale. */
  @Post("export")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("b2b_pricing:read")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(
    @Body(new ZodBody(priceGridExportPayloadSchema)) payload: PriceGridExportPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportPriceGridQuery, PriceGridFile>(
      new ExportPriceGridQuery(payload),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "grille-de-prix.csv")),
    );
    return file.csv;
  }
}
