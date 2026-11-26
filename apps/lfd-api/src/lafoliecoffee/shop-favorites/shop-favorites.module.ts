import { Module } from "@nestjs/common";

import { AddShopFavoriteHandler } from "./application/commands/add-shop-favorite.handler.js";
import { RemoveShopFavoriteHandler } from "./application/commands/remove-shop-favorite.handler.js";
import { GetMyFavoritesHandler } from "./application/queries/get-my-favorites.handler.js";
import { ShopFavoritesReader } from "./domain/ports/shop-favorites.reader.js";
import { ShopFavoritesWriter } from "./domain/ports/shop-favorites.writer.js";
import { MyFavoritesController } from "./http/my-favorites.controller.js";
import { PrismaShopFavoritesStore } from "./infrastructure/prisma-shop-favorites.store.js";

/**
 * Contexte **favoris de la boutique** : les articles qu'un espace garde sous
 * le cœur (`documentation/commandes/boutique/les-favoris.md`). Personne ne
 * l'importe ; il n'exporte rien.
 */
@Module({
  controllers: [MyFavoritesController],
  providers: [
    PrismaShopFavoritesStore,
    { provide: ShopFavoritesReader, useExisting: PrismaShopFavoritesStore },
    { provide: ShopFavoritesWriter, useExisting: PrismaShopFavoritesStore },
    GetMyFavoritesHandler,
    AddShopFavoriteHandler,
    RemoveShopFavoriteHandler,
  ],
})
export class ShopFavoritesModule {}
