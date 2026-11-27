import type { WishlistItemView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { WishlistReader } from "../domain/ports/wishlist.reader.js";
import { WishlistWriter } from "../domain/ports/wishlist.writer.js";

/**
 * La liste d'envies en base (`recurring.wishlist_items`). Chaque requête
 * porte la personne ET la société dans son `where` : c'est le mur.
 */
@Injectable()
export class PrismaWishlistStore implements WishlistReader, WishlistWriter {
  constructor(private readonly prisma: PrismaService) {}

  async itemsOf(userId: string, companyId: string): Promise<readonly WishlistItemView[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId, companyId },
      select: { sku: true, addedAt: true },
      orderBy: [{ addedAt: "desc" }, { sku: "asc" }],
    });
    return rows.map((row) => ({ sku: row.sku, addedAt: row.addedAt.toISOString() }));
  }

  async add(userId: string, companyId: string, sku: string, at: Date): Promise<void> {
    await this.prisma.wishlistItem.createMany({
      data: [{ userId, companyId, sku, addedAt: at }],
      skipDuplicates: true,
    });
  }

  async remove(userId: string, companyId: string, sku: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, companyId, sku } });
  }
}
