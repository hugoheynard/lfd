import type { PickupAddressView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListPickupAddressesQuery } from "../../pickup-addresses/application/list-pickup-addresses.query.js";
import { ListCustomerPickupsQuery } from "../application/queries/list-customer-pickups.query.js";

const companyIdSchema = z.string().trim().min(1).optional();

/**
 * **Les points de retrait, vus de l'équipe** (Hugo, 2026-10-15).
 *
 * - `?companyId=` : ceux que CE client peut choisir — la saisie d'une
 *   commande et sa fiche lui proposent les points de sa clientèle, comme la
 *   boutique les lui proposerait, et la caisse refuserait les autres.
 * - sans paramètre : tous les points proposés — le comptoir et les heures
 *   limites voient tous les sites, quelle que soit leur clientèle.
 *
 * La route publique ne sert plus que ceux des particuliers : l'équipe qui la
 * lisait aurait perdu les sites réservés aux pros. Ouverte à qui lit un des
 * écrans qui la demandent ; ce qu'elle rend n'est pas plus sensible que la
 * liste publique.
 */
@Controller("admin/pickup-addresses")
@AdminSurface("b2b_place_order")
export class AdminOfferedPickupsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @RequireAnyPermission(
    "b2b_place_order:read",
    "b2b_orders:read",
    "b2b_companies:read",
    "b2b_settings:read",
    "handover_counter:read",
    "b2b_counter:read",
  )
  list(
    @Query("companyId", new ZodQuery(companyIdSchema)) companyId: string | undefined,
  ): Promise<readonly PickupAddressView[]> {
    const query =
      companyId === undefined
        ? new ListPickupAddressesQuery(null)
        : new ListCustomerPickupsQuery(companyId);
    return this.queries.execute<
      ListPickupAddressesQuery | ListCustomerPickupsQuery,
      readonly PickupAddressView[]
    >(query);
  }
}
