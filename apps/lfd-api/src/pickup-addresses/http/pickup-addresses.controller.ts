import type { PickupAddressView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../infra/auth/public.decorator.js";
import { ListPickupAddressesQuery } from "../application/list-pickup-addresses.query.js";

/**
 * Lecture **publique** des points de retrait — le client (checkout) comme l'admin
 * en ont besoin. Non sensible. L'écriture est staff ({@link AdminPickupAddressesController}).
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global : c'est
 * la partie la plus exposée de l'API (aucune auth en amont).
 */
@Controller("pickup-addresses")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PickupAddressesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly PickupAddressView[]> {
    return this.queries.execute<ListPickupAddressesQuery, readonly PickupAddressView[]>(
      new ListPickupAddressesQuery(),
    );
  }
}
