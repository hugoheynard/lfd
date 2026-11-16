import { type ProductionSimulationQuery, productionSimulationQuerySchema } from "@lfd/contracts";
import { Controller, Get, Query, Res, type StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { type ProductionPaper, servePaper } from "../../shared/print/index.js";
import { GetProductionSimulationPdfQuery } from "../application/queries/get-production-simulation-pdf.query.js";

/**
 * **Simuler le catalogue en production** — Prod manager › Postes (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.11), sous `production_workstations`
 * en lecture, à côté des routes des postes.
 *
 * La route vit au plan et non dans `workstations/` : elle rend une partie du
 * dossier du jour, que seul le plan monte, et `workstations/` ne lit pas
 * `plan/` (porte `production-subcontexts`). Il n'injecte que le `QueryBus`.
 */
@Controller("admin/production/workstations")
@AdminSurface("production_workstations")
export class ProductionSimulationController {
  constructor(private readonly queries: QueryBus) {}

  @Get("simulation.pdf")
  async simulation(
    @Query(new ZodQuery(productionSimulationQuerySchema)) query: ProductionSimulationQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetProductionSimulationPdfQuery, ProductionPaper>(
      new GetProductionSimulationPdfQuery(query.mode),
    );
    return servePaper(response, pdf);
  }
}
