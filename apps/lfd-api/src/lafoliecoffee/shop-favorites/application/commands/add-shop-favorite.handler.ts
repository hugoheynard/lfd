import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ShopFavoritesWriter } from "../../domain/ports/shop-favorites.writer.js";
import { favoriteHolderOf } from "../../domain/value-objects/favorite-holder.js";
import { AddShopFavoriteCommand } from "./add-shop-favorite.command.js";

/** Pose le favori dans l'espace du principal, à l'instant de la requête. */
@CommandHandler(AddShopFavoriteCommand)
export class AddShopFavoriteHandler implements ICommandHandler<AddShopFavoriteCommand, void> {
  constructor(
    private readonly writer: ShopFavoritesWriter,
    private readonly clock: Clock,
  ) {}

  async execute(command: AddShopFavoriteCommand): Promise<void> {
    const holder = favoriteHolderOf(command.userId, command.actingCompanyId);
    await this.writer.add(holder, command.sku, this.clock.now());
  }
}
