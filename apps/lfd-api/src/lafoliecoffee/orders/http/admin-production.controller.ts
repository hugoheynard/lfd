import {
  type ProductionBatchQuery,
  productionBatchQuerySchema,
  type ProductionBatchView,
  type OrderPackingView,
} from "@lfd/contracts";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetPackingQuery } from "../application/queries/get-packing.query.js";
import { GetProductionBatchQuery } from "../application/queries/get-production-batch.query.js";

/**
 * Ce que le **labo** doit fabriquer — la matière des fiches de fonction.
 *
 * Contrôleur à part et non une route de plus sur `admin/orders` : ce n'est pas
 * la même question. `admin/orders` sert un commercial qui cherche une commande ;
 * ici on sert une journée de production entière, avec ses lignes, et sans un
 * seul montant. Deux publics, deux surfaces.
 *
 * Une garde PAR ROUTE depuis le 2026-10-01 (`documentation/livraisons/droits/plan-droits-par-geste.md`, 5.1) :
 * le lot du jour est le plan du soir (`production_plan`), la fiche derrière le
 * QR est le colisage (`production_packing`). Elles étaient toutes deux sous
 * `b2b_orders`, qui ouvrait aussi la passation.
 */
@Controller("admin/production")
@AdminSurface("production_plan")
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

  /**
   * Ce qu'il y a derrière le QR d'une fiche — **avant** de déclarer quoi que ce
   * soit. Le code encode le numéro de commande, déjà imprimé en clair sur la
   * même feuille : le scanner ne révèle rien, il évite de le retaper d'une main
   * farineuse.
   */
  @Get("packing/:reference")
  @RequirePermission("production_packing:read")
  async packing(@Param("reference") reference: string): Promise<OrderPackingView> {
    return this.queries.execute<GetPackingQuery, OrderPackingView>(new GetPackingQuery(reference));
  }
}
