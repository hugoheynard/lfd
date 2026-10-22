import type { UnconfirmedDeliveriesView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListUnconfirmedDeliveriesQuery } from "../application/queries/list-unconfirmed-deliveries.query.js";

/**
 * Surface **staff** des bons à constater (lot ZL) : lecture seule, sous la
 * même ressource que la facture du mois (`b2b_accounting`).
 */
@Controller("admin/accounting/unconfirmed-deliveries")
@AdminSurface("b2b_accounting")
export class AdminUnconfirmedDeliveriesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<UnconfirmedDeliveriesView> {
    return this.queries.execute<ListUnconfirmedDeliveriesQuery, UnconfirmedDeliveriesView>(
      new ListUnconfirmedDeliveriesQuery(),
    );
  }
}
