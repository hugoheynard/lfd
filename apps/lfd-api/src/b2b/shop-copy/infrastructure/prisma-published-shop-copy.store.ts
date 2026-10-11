import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ShopCopyLocale } from "../domain/shop-copy-locale.js";
import { PublishedShopCopyStore } from "./published-shop-copy.store.js";
import { SHOP_COPY_PUBLICATION_KEY } from "./shop-copy-rows.js";

/** Adaptateur Prisma des deux lectures du cache des textes publiés. */
@Injectable()
export class PrismaPublishedShopCopyStore extends PublishedShopCopyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async version(): Promise<number> {
    const row = await this.prisma.shopCopyPublication.findUnique({
      where: { key: SHOP_COPY_PUBLICATION_KEY },
      select: { version: true },
    });
    return row?.version ?? 0;
  }

  async texts(locale: ShopCopyLocale): Promise<Readonly<Record<string, string>>> {
    const rows = await this.prisma.shopCopyEntry.findMany({
      where: { locale, publishedText: { not: null } },
      select: { key: true, publishedText: true },
    });
    return Object.fromEntries(
      rows.flatMap((row) => (row.publishedText === null ? [] : [[row.key, row.publishedText]])),
    );
  }
}
