import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  CatalogCategoryProjection,
  type CatalogCategoryFacts,
} from "../domain/ports/catalog-category.projection.js";

/**
 * Miroir des familles. `upsert` plutôt que table rase : les articles y font
 * référence, et vider la table les emporterait par cascade — avec leurs
 * décisions.
 */
@Injectable()
export class PrismaCatalogCategoryProjection extends CatalogCategoryProjection {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async replaceAll(categories: readonly CatalogCategoryFacts[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const category of categories) {
        const row = {
          name: category.name,
          slug: category.slug,
          parentId: category.parentId,
          position: category.position,
          vatRatePercent: category.vatRatePercent,
          receivedAt: category.receivedAt,
        };
        await tx.catalogCategory.upsert({
          where: { id: category.id },
          create: { id: category.id, ...row },
          update: row,
        });
      }
    });
  }
}
