import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { optionalLocalizedColumn } from "../../../shared/json-readers.js";
import { sourceLabel } from "../../shared/domain/value-objects/localized-text.js";
import {
  CategoryImageHolders,
  type CategoryImageHolder,
} from "../domain/ports/category-image-holders.js";

/**
 * L'adaptateur, sur `categoryMedia`.
 *
 * Un porteur peut tenir la même image sous deux RÔLES : la question est « qui
 * l'affiche », pas « à combien de places », d'où le dédoublonnage par
 * identifiant.
 */
@Injectable()
export class PrismaCategoryImageHolders extends CategoryImageHolders {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const wanted = [...new Set(urls)];
    if (wanted.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.categoryMedia.groupBy({
      by: ["mediaUrl"],
      where: { mediaUrl: { in: wanted } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.mediaUrl, group._count._all] as const));
  }

  async holdersOf(url: string): Promise<readonly CategoryImageHolder[]> {
    const rows = await this.prisma.categoryMedia.findMany({
      where: { mediaUrl: url },
      select: { categoryId: true, category: { select: { name: true } } },
    });
    const holders = new Map<string, CategoryImageHolder>();
    for (const row of rows) {
      holders.set(row.categoryId, {
        id: row.categoryId,
        label: sourceLabel(optionalLocalizedColumn(row.category.name), row.categoryId),
      });
    }
    return [...holders.values()];
  }
}
