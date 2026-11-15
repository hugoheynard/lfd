import { productionBatchQuerySchema } from "@lfd/contracts";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodParam } from "../../platform/shared/http/zod-body.pipe.js";
import { GetAtelierSheetPdfQuery } from "../application/queries/get-atelier-sheet-pdf.query.js";
import { type ProductionPaper, servePaper } from "./production-paper-response.js";

/** Le jour du chemin, validé dans sa FORME par un pipe : un 400 qui nomme le paramètre. */
const DAY = new ZodParam(productionBatchQuerySchema.shape.date, "date");

/**
 * **La fiche d'atelier imprimable** — un document de l'atelier, servi sous le
 * préfixe et la surface de la journée (`production_plan`) dont il a toujours
 * été lu, mais gardé par le droit du poste qui l'imprime
 * (`production_worksheet:read`). Le chemin ne change pas avec le rangement.
 *
 * Il n'injecte qu'un bus. `lint:controller-buses` le tient.
 */
@Controller("admin/production")
@AdminSurface("production_plan")
export class ProductionAtelierSheetController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * **La feuille d'atelier d'une commande, en PDF** — celle qui part au fournil.
   *
   * Elle se lit dans la JOURNÉE, jamais dans le commerce : c'est ce que la
   * production a inscrit à la clôture, et c'est ce papier-là qui est parti.
   *
   * ⚠️ Elle porte son **QR de colisage**, et c'est l'inverse du bon de commande :
   * ce code encode un NOM (`/colisage/{référence}`), pas un secret. La référence
   * est déjà écrite en toutes lettres au-dessus.
   */
  @Get("batch/:date/sheets/:reference.pdf")
  @RequirePermission("production_worksheet:read")
  async sheet(
    @Param("date", DAY) date: string,
    @Param("reference") reference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return servePaper(
      response,
      await this.queries.execute<GetAtelierSheetPdfQuery, ProductionPaper>(
        new GetAtelierSheetPdfQuery(date, reference),
      ),
    );
  }
}
