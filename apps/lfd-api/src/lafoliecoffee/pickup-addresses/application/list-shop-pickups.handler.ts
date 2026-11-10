import type { AudiencePickupAddressView, CustomerAudience } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { audiencePickupAddressOf } from "./audience-pickup-address.js";
import { ListShopPickupsQuery } from "./list-shop-pickups.query.js";

/**
 * Sert les points d'une audience déclarée, avec la remise de cette audience
 * seule. Lecture pure. La vitrine pro lit l'annonce d'une société active
 * (`b2b`), le visiteur celle des particuliers (`b2c`) — les mêmes clés que
 * la clientèle qui filtre la liste.
 */
@QueryHandler(ListShopPickupsQuery)
export class ListShopPickupsHandler implements IQueryHandler<
  ListShopPickupsQuery,
  readonly AudiencePickupAddressView[]
> {
  constructor(private readonly pickups: PickupAddressRepository) {}

  async execute(query: ListShopPickupsQuery): Promise<readonly AudiencePickupAddressView[]> {
    const audience: CustomerAudience = query.audience === "pro" ? "b2b" : "b2c";
    const points = await this.pickups.list(audience);
    return points.map((point) => audiencePickupAddressOf(point, audience));
  }
}
