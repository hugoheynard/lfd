import {
  type ProductionBatchQuery,
  productionBatchQuerySchema,
  type ProductionBatchView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../shared/http/zod-body.pipe.js";
import { GetProductionBatchQuery } from "../application/queries/get-production-batch.query.js";

/**
 * Ce que le **labo** doit fabriquer — la matière des fiches de fonction.
 *
 * Contrôleur à part et non une route de plus sur `admin/orders` : ce n'est pas
 * la même question. `admin/orders` sert un commercial qui cherche une commande ;
 * ici on sert une journée de production entière, avec ses lignes, et sans un
 * seul montant. Deux publics, deux surfaces.
 *
 * Ressource `orders` malgré tout au sens des permissions : ce sont les mêmes
 * données, en lecture. Inventer un périmètre `production` aurait obligé à
 * l'accorder à quelqu'un avant que le premier écran existe.
 */
@Controller("admin/production")
@AdminSurface("orders")
export class AdminProductionController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Le lot d'une journée de **service** (retrait ou livraison), pas de commande :
   * le labo travaille pour un jour de sortie, pas pour un jour de saisie.
   */
  @Get("batch")
  async batch(
    @Query(new ZodQuery(productionBatchQuerySchema)) query: ProductionBatchQuery,
  ): Promise<ProductionBatchView> {
    return this.queries.execute<GetProductionBatchQuery, ProductionBatchView>(
      new GetProductionBatchQuery(query.date),
    );
  }
}
