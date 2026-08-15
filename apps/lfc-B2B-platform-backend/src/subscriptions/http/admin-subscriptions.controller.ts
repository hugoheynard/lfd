import type { AdminSubscriptionRow } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { ListCompanySubscriptionsQuery } from "../application/queries/list-company-subscriptions.query.js";

/**
 * Les **paniers récurrents d'un compte**, vus du back-office.
 *
 * Ressource `orders` : un panier récurrent est un gabarit de commande, il se lit
 * au même droit et par les mêmes gens. Lui donner sa propre ressource
 * multiplierait les permissions sans multiplier les décisions.
 *
 * Lecture seule pour l'instant : suspendre ou reprendre l'abonnement d'un client
 * est une mutation sur son engagement, qui demande sa propre trace et sa propre
 * décision produit.
 */
@Controller("admin/companies/:companyId/subscriptions")
@AdminSurface("orders")
export class AdminSubscriptionsController {
  constructor(private readonly queries: QueryBus) {}

  /** Les paniers des membres de la société, plus récents d'abord. */
  @Get()
  async list(@Param("companyId") companyId: string): Promise<readonly AdminSubscriptionRow[]> {
    return this.queries.execute<ListCompanySubscriptionsQuery, readonly AdminSubscriptionRow[]>(
      new ListCompanySubscriptionsQuery(companyId),
    );
  }
}
