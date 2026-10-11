import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShopCopyRenamer } from "../domain/ports/shop-copy-renamer.js";

/**
 * Adaptateur Prisma du report des renommages.
 *
 * Une écriture de clé nue, sans agrégat, et c'est voulu : ce n'est pas un geste
 * de rédacteur mais un déménagement de lignes, décidé dans le code (le fichier
 * des renommages, tenu par `lint:shop-copy-digest`). Le seul invariant —
 * ne jamais écraser une ligne déjà posée sous la nouvelle clé — est dans le
 * `where` : la langue n'est déplacée que si la nouvelle clé ne l'a pas.
 */
@Injectable()
export class PrismaShopCopyRenamer extends ShopCopyRenamer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async relocate(from: string, to: string): Promise<number> {
    const taken = await this.prisma.shopCopyEntry.findMany({
      where: { key: to },
      select: { locale: true },
    });
    const moved = await this.prisma.shopCopyEntry.updateMany({
      where: { key: from, locale: { notIn: taken.map((row) => row.locale) } },
      data: { key: to },
    });
    return moved.count;
  }
}
