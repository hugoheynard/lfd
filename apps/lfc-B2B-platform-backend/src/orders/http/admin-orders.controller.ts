import {
  type AdminOrderRow,
  type AdminOrdersQuery,
  adminOrdersQuerySchema,
  type OrderView,
} from "@lfd/contracts";
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodQuery } from "../../shared/http/zod-body.pipe.js";
import { GetAdminOrderQuery } from "../application/queries/get-admin-order.query.js";
import { ListAdminOrdersQuery } from "../application/queries/list-admin-orders.query.js";

/**
 * Lecture **staff** des commandes — la surface qui manquait : le commercial ne
 * pouvait ni parcourir les commandes, ni en ouvrir une (les routes client
 * exigent d'être le client ou un membre de la société, ce qu'il n'est pas).
 *
 * Montage à deux surfaces habituel : `@Public()` désarme le guard client,
 * `AdminAuthGuard` réarme la porte staff.
 *
 * **Lecture seule.** Faire avancer une commande ou l'annuler sont des décisions
 * de production, pas des boutons d'écran ; elles viendront avec les avenants
 * (cf. `architecture-commande-immuable-avenants.md`).
 */
@Controller("admin/orders")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminOrdersController {
  constructor(private readonly queries: QueryBus) {}

  /** Les commandes, la plus récente en tête, filtrables par société et par état. */
  @Get()
  async list(
    @Query(new ZodQuery(adminOrdersQuerySchema)) filters: AdminOrdersQuery,
  ): Promise<readonly AdminOrderRow[]> {
    return this.queries.execute<ListAdminOrdersQuery, readonly AdminOrderRow[]>(
      new ListAdminOrdersQuery(filters),
    );
  }

  /** Une commande, dans la même vue que celle du client — délibérément. */
  @Get(":id")
  async one(@Param("id") id: string): Promise<OrderView> {
    return this.queries.execute<GetAdminOrderQuery, OrderView>(new GetAdminOrderQuery(id));
  }
}
