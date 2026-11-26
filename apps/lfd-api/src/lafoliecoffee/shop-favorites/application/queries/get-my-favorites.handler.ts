import type { MyFavoritesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ShopFavoritesReader } from "../../domain/ports/shop-favorites.reader.js";
import { favoriteHolderOf } from "../../domain/value-objects/favorite-holder.js";
import { GetMyFavoritesQuery } from "./get-my-favorites.query.js";

/**
 * **Mes favoris** — les SKU de l'espace courant, sans filtre de vitrine : un
 * SKU qui n'est plus servi n'apparaît simplement pas dans l'onglet.
 */
@QueryHandler(GetMyFavoritesQuery)
export class GetMyFavoritesHandler implements IQueryHandler<GetMyFavoritesQuery, MyFavoritesView> {
  constructor(private readonly reader: ShopFavoritesReader) {}

  async execute(query: GetMyFavoritesQuery): Promise<MyFavoritesView> {
    const holder = favoriteHolderOf(query.userId, query.actingCompanyId);
    return { skus: await this.reader.skusOf(holder) };
  }
}
