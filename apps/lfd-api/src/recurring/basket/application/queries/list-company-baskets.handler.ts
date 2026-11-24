import type { AdminSubscriptionRow } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import { BasketReader } from "../../domain/ports/basket.reader.js";
import { ListCompanyBasketsQuery } from "./list-company-baskets.query.js";

/**
 * Sert les paniers des **membres** d'une société, nommés. Aucun mur ici : la
 * surface est `@AdminSurface`. Les membres viennent des comptes, par le
 * canal : le bloc ne lit pas l'annuaire. Une société inconnue rend une liste
 * vide, comme une société sans panier.
 */
@QueryHandler(ListCompanyBasketsQuery)
export class ListCompanyBasketsHandler implements IQueryHandler<
  ListCompanyBasketsQuery,
  readonly AdminSubscriptionRow[]
> {
  constructor(
    private readonly standing: BasketBuyerStanding,
    private readonly baskets: BasketReader,
  ) {}

  async execute(query: ListCompanyBasketsQuery): Promise<readonly AdminSubscriptionRow[]> {
    const members = await this.standing.membersOf(query.companyId);
    return members.length === 0 ? [] : this.baskets.listForBuyers(members);
  }
}
