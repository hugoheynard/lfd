import type { ShopCartView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ShopCartRepository } from "../../domain/ports/shop-cart.repository.js";
import { GetShopCartQuery } from "./get-shop-cart.query.js";

/**
 * Rend le panier en cours d'une personne, ou `null`.
 *
 * `null` couvre trois cas que l'appelant n'a pas à distinguer : jamais de
 * panier, panier effacé, panier devenu illisible. Dans les trois, la boutique
 * fait la même chose — elle garde ce qu'elle a sous la main et le verse au
 * prochain enregistrement.
 */
@QueryHandler(GetShopCartQuery)
export class GetShopCartHandler implements IQueryHandler<GetShopCartQuery, ShopCartView | null> {
  constructor(private readonly carts: ShopCartRepository) {}

  execute(query: GetShopCartQuery): Promise<ShopCartView | null> {
    return this.carts.find(query.userId);
  }
}
