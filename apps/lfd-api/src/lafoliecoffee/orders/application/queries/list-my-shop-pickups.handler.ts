import { pickupAnnouncementOf, type AudiencePickupAddressView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { audiencePickupAddressOf } from "../../../pickup-addresses/application/audience-pickup-address.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { CustomerAudiences } from "../services/customer-audiences.service.js";
import { ListMyShopPickupsQuery } from "./list-my-shop-pickups.query.js";

/**
 * **Les points d'un client reconnu, avec SA remise.**
 *
 * La liste suit la clientèle que la caisse lira (`CustomerAudiences`), comme
 * `ListCustomerPickupsHandler` ; la remise suit l'annonce de son statut
 * (`pickupAnnouncementOf`) — une société en attente est servie en pro par la
 * caisse et lit `b2bPending`. Les deux sont établis au serveur, jamais
 * déclarés : c'est ce qui permet de servir ici, et seulement ici, la remise
 * des pros en cours d'inscription.
 */
@QueryHandler(ListMyShopPickupsQuery)
export class ListMyShopPickupsHandler implements IQueryHandler<
  ListMyShopPickupsQuery,
  readonly AudiencePickupAddressView[]
> {
  constructor(
    private readonly audiences: CustomerAudiences,
    private readonly pickups: PickupAddressRepository,
  ) {}

  async execute(query: ListMyShopPickupsQuery): Promise<readonly AudiencePickupAddressView[]> {
    const standing = await this.audiences.standingOf(query.companyId);
    const key = pickupAnnouncementOf(standing.companyStatus);
    const points = await this.pickups.list(standing.audience);
    return points.map((point) => audiencePickupAddressOf(point, key));
  }
}
