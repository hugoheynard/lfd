import type { PickupAddressView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { ListPickupAddressesQuery } from "./list-pickup-addresses.query.js";

/** Sert la liste des points de retrait d'une clientèle, ou de toutes. Lecture pure. */
@QueryHandler(ListPickupAddressesQuery)
export class ListPickupAddressesHandler implements IQueryHandler<
  ListPickupAddressesQuery,
  readonly PickupAddressView[]
> {
  constructor(private readonly pickups: PickupAddressRepository) {}

  execute(query: ListPickupAddressesQuery): Promise<readonly PickupAddressView[]> {
    return this.pickups.list(query.audience);
  }
}
