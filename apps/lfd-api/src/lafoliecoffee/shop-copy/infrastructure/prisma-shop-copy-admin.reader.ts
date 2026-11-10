import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ShopCopyAdminReader,
  type ShopCopyPublicationState,
} from "../domain/ports/shop-copy-admin.reader.js";
import type { ShopCopyEntryState } from "../domain/shop-copy-entry.js";
import { SHOP_COPY_PUBLICATION_KEY, toState } from "./shop-copy-rows.js";

/** Adaptateur Prisma de l'éditeur : toutes les lignes, la publication. */
@Injectable()
export class PrismaShopCopyAdminReader extends ShopCopyAdminReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async entries(): Promise<readonly ShopCopyEntryState[]> {
    const rows = await this.prisma.shopCopyEntry.findMany({
      orderBy: [{ key: "asc" }, { locale: "asc" }],
    });
    return rows.flatMap((row) => {
      const state = toState(row);
      return state === null ? [] : [state];
    });
  }

  async publication(): Promise<ShopCopyPublicationState> {
    const row = await this.prisma.shopCopyPublication.findUnique({
      where: { key: SHOP_COPY_PUBLICATION_KEY },
    });
    return {
      version: row?.version ?? 0,
      publishedAt: row?.publishedAt ?? null,
      publishedBy: row?.publishedBy ?? null,
    };
  }
}
