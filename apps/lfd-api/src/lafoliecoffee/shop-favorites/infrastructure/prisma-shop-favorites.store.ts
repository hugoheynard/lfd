import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShopFavoritesReader } from "../domain/ports/shop-favorites.reader.js";
import { ShopFavoritesWriter } from "../domain/ports/shop-favorites.writer.js";
import type { FavoriteHolder } from "../domain/value-objects/favorite-holder.js";

/**
 * Les favoris en base (`public.shop_favorite`). Chaque requête porte le
 * titulaire dans son `where` : c'est le mur, un espace ne lit ni n'écrit
 * jamais ceux d'un autre.
 */
@Injectable()
export class PrismaShopFavoritesStore implements ShopFavoritesReader, ShopFavoritesWriter {
  constructor(private readonly prisma: PrismaService) {}

  async skusOf(holder: FavoriteHolder): Promise<readonly string[]> {
    const rows = await this.prisma.shopFavorite.findMany({
      where: { holderType: holder.type, holderId: holder.id },
      select: { sku: true },
      orderBy: [{ createdAt: "desc" }, { sku: "asc" }],
    });
    return rows.map((row) => row.sku);
  }

  async add(holder: FavoriteHolder, sku: string, at: Date): Promise<void> {
    await this.prisma.shopFavorite.createMany({
      data: [{ holderType: holder.type, holderId: holder.id, sku, createdAt: at }],
      skipDuplicates: true,
    });
  }

  async remove(holder: FavoriteHolder, sku: string): Promise<void> {
    await this.prisma.shopFavorite.deleteMany({
      where: { holderType: holder.type, holderId: holder.id, sku },
    });
  }
}
