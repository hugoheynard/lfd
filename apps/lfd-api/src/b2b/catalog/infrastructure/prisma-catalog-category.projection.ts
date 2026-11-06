import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShelfChanges } from "../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { ALL_SHELVES } from "../../shared/shelf-changes/domain/shelf-change-scope.js";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly shelves: ShelfChanges,
  ) {
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
    // Après la transaction, par lisibilité : depuis le 2026-11-06 (lot M2), une
    // transaction directe a aussi sa file d'après validation (`transactional-prisma.ts`).
    this.shelves.changed(ALL_SHELVES);
  }
}
