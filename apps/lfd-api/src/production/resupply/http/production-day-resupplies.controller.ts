import { type ProductionDayResuppliesView, productionBatchQuerySchema } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetDayResuppliesQuery } from "../application/queries/get-day-resupplies.query.js";

/** Le jour du chemin, validé dans sa FORME par un pipe : un 400 qui nomme le paramètre. */
const DAY = new ZodParam(productionBatchQuerySchema.shape.date, "date");

/**
 * **Les réassorts d'une journée**, côté réassort — servis sous le préfixe et
 * la surface de la journée (`production_plan`), que le dossier du jour lit.
 * Le chemin ne change pas avec le rangement.
 *
 * Il n'injecte qu'un bus. `lint:controller-buses` le tient.
 */
@Controller("admin/production")
@AdminSurface("production_plan")
export class ProductionDayResuppliesController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Figés si la journée est arrêtée, envoyés « pour demain » sinon. Le
   * dossier du jour les montre à part des commandes.
   */
  @Get("batch/:date/resupplies")
  async resupplies(@Param("date", DAY) date: string): Promise<ProductionDayResuppliesView> {
    return this.queries.execute<GetDayResuppliesQuery, ProductionDayResuppliesView>(
      new GetDayResuppliesQuery(date),
    );
  }
}
