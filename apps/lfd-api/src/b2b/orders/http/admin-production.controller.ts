import {
  type ProductionBatchQuery,
  productionBatchQuerySchema,
  type ProductionBatchView,
  type OrderPackingView,
} from "@lfd/contracts";
import { Controller, Get, Param, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../../platform/auth/staff-principal.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { MarkOrderReadyCommand } from "../application/commands/mark-order-ready.command.js";
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
 * Ressource `orders` malgré tout au sens des permissions : ce sont les mêmes
 * données, en lecture. Inventer un périmètre `production` aurait obligé à
 * l'accorder à quelqu'un avant que le premier écran existe.
 */
@Controller("admin/production")
@AdminSurface("b2b_orders")
export class AdminProductionController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

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
  async packing(@Param("reference") reference: string): Promise<OrderPackingView> {
    return this.queries.execute<GetPackingQuery, OrderPackingView>(new GetPackingQuery(reference));
  }

  /**
   * **La commande est prête.** Le geste que le papier annonce, et le seul du
   * fournil qui écrive en base.
   *
   * Porte staff comme tout `/admin/*`. Ici elle ne fait pas office de preuve
   * contradictoire — le colisage est un fait interne, il n'y a personne d'autre
   * à représenter — mais elle décide **qui** l'a déclaré, et ça, ça ne vient
   * jamais de la charge utile.
   */
  @Post("packing/:reference/ready")
  async markReady(
    @Param("reference") reference: string,
    @Req() request: AuthenticatedStaffRequest,
  ): Promise<OrderPackingView> {
    return this.commands.execute<MarkOrderReadyCommand, OrderPackingView>(
      new MarkOrderReadyCommand(reference, staffSubjectOf(request)),
    );
  }
}

/**
 * L'identité staff posée par le guard. Le `?` du type l'autorise à manquer ; en
 * pratique le guard a couru avant nous, mais on refuse plutôt que d'écrire un
 * colisage anonyme — un fait daté sans auteur ne se conteste pas, il s'efface.
 */
function staffSubjectOf(request: AuthenticatedStaffRequest): string {
  const subject = request.staff?.subject;
  if (subject === undefined) {
    throw new UnauthorizedException("Session staff requise.");
  }
  return subject;
}
