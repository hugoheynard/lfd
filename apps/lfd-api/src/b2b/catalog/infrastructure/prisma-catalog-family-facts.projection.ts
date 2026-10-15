import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CatalogCategoryFacts } from "../domain/ports/catalog-category.projection.js";
import { CatalogFamilyFactsProjection } from "../domain/ports/catalog-family-facts.projection.js";

/**
 * L'adaptateur du récepteur des faits d'une famille : une écriture
 * conditionnée sur `applied_seq`, en une instruction. Jamais de suppression.
 */
@Injectable()
export class PrismaCatalogFamilyFactsProjection extends CatalogFamilyFactsProjection {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async applyIfNewer(family: CatalogCategoryFacts, seq: number): Promise<boolean> {
    // `applied_seq IS NULL` : posée par un push ou apportée par une fiche, la
    // famille n'a encore reçu aucun fait d'elle-même — le premier s'applique.
    const written = await this.prisma.$executeRaw`
      INSERT INTO public.catalog_categories
        (id, name, slug, parent_id, position, vat_rate_percent, received_at, applied_seq)
      VALUES (${family.id}, ${family.name}, ${family.slug}, ${family.parentId}, ${family.position},
              ${family.vatRatePercent}, ${family.receivedAt}, ${seq})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        parent_id = EXCLUDED.parent_id,
        position = EXCLUDED.position,
        vat_rate_percent = EXCLUDED.vat_rate_percent,
        received_at = EXCLUDED.received_at,
        applied_seq = EXCLUDED.applied_seq
      WHERE public.catalog_categories.applied_seq IS NULL
         OR public.catalog_categories.applied_seq < EXCLUDED.applied_seq`;
    return written > 0;
  }
}
