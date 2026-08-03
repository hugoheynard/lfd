import type { PickupAddressView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { Public } from "../../infra/auth/public.decorator.js";
import { ListPickupAddressesQuery } from "../application/list-pickup-addresses.query.js";

/**
 * Lecture **publique** des points de retrait — le client (checkout) comme l'admin
 * en ont besoin. Non sensible. L'écriture est staff ({@link AdminPickupAddressesController}).
 */
@Controller("pickup-addresses")
@Public()
export class PickupAddressesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly PickupAddressView[]> {
    return this.queries.execute<ListPickupAddressesQuery, readonly PickupAddressView[]>(
      new ListPickupAddressesQuery(),
    );
  }
}
