import type { ShopCartView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ShopCartRepository } from "../../domain/ports/shop-cart.repository.js";
import { GetShopCartQuery } from "./get-shop-cart.query.js";
import { SaleReferenceIntake } from "../../../catalog/application/sale-reference-intake.service.js";

/**
 * Rend le panier en cours d'une personne dans un espace, ou `null`.
 *
 * `null` couvre trois cas que l'appelant n'a pas à distinguer : jamais de
 * panier dans cet espace, panier effacé, panier devenu illisible. Dans les
 * trois, la boutique fait la même chose — elle garde ce qu'elle a sous la main
 * et le verse au prochain enregistrement.
 *
 * Ses lignes sortent sous la référence de l'article qu'elles désignent
 * (`plan-defaut-sous-sa-reference.md`, § 5) : la base garde ce qui a été
 * écrit jusqu'au prochain enregistrement, la boutique ne voit que l'article.
 */
@QueryHandler(GetShopCartQuery)
export class GetShopCartHandler implements IQueryHandler<GetShopCartQuery, ShopCartView | null> {
  constructor(
    private readonly carts: ShopCartRepository,
    private readonly intake: SaleReferenceIntake,
  ) {}

  async execute(query: GetShopCartQuery): Promise<ShopCartView | null> {
    const cart = await this.carts.find(query.userId, query.companyId);
    if (cart === null) {
      return null;
    }
    return { ...cart, lines: [...(await this.intake.normalized(cart.lines, "shop_cart"))] };
  }
}
