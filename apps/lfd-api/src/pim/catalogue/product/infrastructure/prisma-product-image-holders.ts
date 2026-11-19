import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { optionalLocalizedColumn } from "../../../shared/json-readers.js";
import { sourceLabel } from "../../shared/domain/value-objects/localized-text.js";
import {
  ProductImageHolders,
  type ProductImageHolder,
} from "../domain/ports/product-image-holders.js";

/**
 * L'adaptateur, sur `productMedia`.
 * Une fiche supprimée n'affiche plus rien : la compter garderait une image
 * « utilisée » par une fiche qu'aucun écran ne retrouve.
 *
 * Un porteur peut tenir la même image sous deux RÔLES : la question est « qui
 * l'affiche », pas « à combien de places », d'où le dédoublonnage par
 * identifiant.
 */
@Injectable()
export class PrismaProductImageHolders extends ProductImageHolders {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const wanted = [...new Set(urls)];
    if (wanted.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.productMedia.groupBy({
      by: ["mediaUrl"],
      where: { mediaUrl: { in: wanted }, product: { status: { not: "deleted" } } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.mediaUrl, group._count._all] as const));
  }

  async holdersOf(url: string): Promise<readonly ProductImageHolder[]> {
    const rows = await this.prisma.productMedia.findMany({
      where: { mediaUrl: url, product: { status: { not: "deleted" } } },
      select: { productId: true, product: { select: { name: true } } },
    });
    const holders = new Map<string, ProductImageHolder>();
    for (const row of rows) {
      holders.set(row.productId, {
        id: row.productId,
        label: sourceLabel(optionalLocalizedColumn(row.product.name), row.productId),
      });
    }
    return [...holders.values()];
  }
}
