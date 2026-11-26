import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ShopFavoritesWriter } from "../../domain/ports/shop-favorites.writer.js";
import { favoriteHolderOf } from "../../domain/value-objects/favorite-holder.js";
import { RemoveShopFavoriteCommand } from "./remove-shop-favorite.command.js";

/** Retire le favori de l'espace du principal ; un absent n'est pas une faute. */
@CommandHandler(RemoveShopFavoriteCommand)
export class RemoveShopFavoriteHandler implements ICommandHandler<RemoveShopFavoriteCommand, void> {
  constructor(private readonly writer: ShopFavoritesWriter) {}

  async execute(command: RemoveShopFavoriteCommand): Promise<void> {
    const holder = favoriteHolderOf(command.userId, command.actingCompanyId);
    await this.writer.remove(holder, command.sku);
  }
}
