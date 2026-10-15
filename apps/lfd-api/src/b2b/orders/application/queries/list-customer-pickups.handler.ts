import type { PickupAddressView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { CustomerAudiences } from "../services/customer-audiences.service.js";
import { ListCustomerPickupsQuery } from "./list-customer-pickups.query.js";

/**
 * **Les points de retrait d'un client**, filtrés AU SERVEUR par sa clientèle
 * (Hugo, 2026-10-15 : « c'est devenu un choix business »).
 *
 * La clientèle est celle que la caisse lira (`CustomerAudiences`) : la liste
 * ne propose donc que des points que la commande acceptera. Le refus de la
 * caisse (`PickupClosedForAudienceError`) reste — une liste ne garde pas une
 * porte.
 */
@QueryHandler(ListCustomerPickupsQuery)
export class ListCustomerPickupsHandler implements IQueryHandler<
  ListCustomerPickupsQuery,
  readonly PickupAddressView[]
> {
  constructor(
    private readonly audiences: CustomerAudiences,
    private readonly pickups: PickupAddressRepository,
  ) {}

  async execute(query: ListCustomerPickupsQuery): Promise<readonly PickupAddressView[]> {
    return this.pickups.list(await this.audiences.of(query.companyId));
  }
}
