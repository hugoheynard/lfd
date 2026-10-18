import {
  audiencesQuerySchema,
  DEFAULT_AUDIENCE_PERIOD,
  type AudiencesQuery,
  type AudiencesView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetAudiencesQuery } from "../application/queries/get-audiences.query.js";

/**
 * **Les audiences de la clientèle** — `GET /admin/audiences` (lot A1,
 * `documentation/recommandation-produit/plan-audiences.md`).
 *
 * Sous `b2b_growth`, le droit des tableaux de croissance et des compteurs
 * d'audience (`admin-product-audience.controller.ts`) : la même nature de
 * chiffres agrégés, lus pour comprendre et non pour agir sur un dossier.
 * Aucune ressource neuve, donc aucun droit à accorder.
 */
@Controller("admin/audiences")
@AdminSurface("b2b_growth")
export class AdminAudiencesController {
  constructor(private readonly queries: QueryBus) {}

  /** Une période (7, 30 par défaut, 90 jours métier), une coupe ou toutes. */
  @Get()
  read(@Query(new ZodQuery(audiencesQuerySchema)) query: AudiencesQuery): Promise<AudiencesView> {
    return this.queries.execute<GetAudiencesQuery, AudiencesView>(
      new GetAudiencesQuery(query.days ?? DEFAULT_AUDIENCE_PERIOD, query.dimension ?? null),
    );
  }
}
