import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CatalogFamilyFactsProjection,
  type ReceivedCatalogFamily,
} from "../domain/ports/catalog-family-facts.projection.js";

/**
 * L'adaptateur du récepteur des faits d'une famille : une écriture
 * conditionnée sur `applied_seq`, en une instruction. Jamais de suppression :
 * une famille archivée pose `withdrawn_at` (lot 2b), et garde la date du
 * premier fait qui l'a dite archivée — un fait suivant ne la repousse pas.
 */
@Injectable()
export class PrismaCatalogFamilyFactsProjection extends CatalogFamilyFactsProjection {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async applyIfNewer(family: ReceivedCatalogFamily, seq: number): Promise<boolean> {
    const withdrawnAt = family.archived ? family.receivedAt : null;
    // `null` = un fait d'avant le lot des langues : la colonne repasse à NULL,
    // « on ne sait pas », et le rayon se nomme en français.
    const translations =
      family.nameTranslations === null ? null : JSON.stringify(family.nameTranslations);
    // `applied_seq IS NULL` : posée par un push ou apportée par une fiche, la
    // famille n'a encore reçu aucun fait d'elle-même — le premier s'applique.
    const written = await this.prisma.$executeRaw`
      INSERT INTO public.catalog_categories
        (id, name, name_translations, slug, parent_id, position, vat_rate_percent, received_at,
         applied_seq, audience, withdrawn_at)
      VALUES (${family.id}, ${family.name}, ${translations}::jsonb, ${family.slug},
              ${family.parentId}, ${family.position},
              ${family.vatRatePercent}, ${family.receivedAt}, ${seq},
              ${family.audience}, ${withdrawnAt})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        name_translations = EXCLUDED.name_translations,
        slug = EXCLUDED.slug,
        parent_id = EXCLUDED.parent_id,
        position = EXCLUDED.position,
        vat_rate_percent = EXCLUDED.vat_rate_percent,
        received_at = EXCLUDED.received_at,
        applied_seq = EXCLUDED.applied_seq,
        audience = EXCLUDED.audience,
        withdrawn_at = CASE
          WHEN EXCLUDED.withdrawn_at IS NULL THEN NULL
          ELSE COALESCE(public.catalog_categories.withdrawn_at, EXCLUDED.withdrawn_at)
        END
      WHERE public.catalog_categories.applied_seq IS NULL
         OR public.catalog_categories.applied_seq < EXCLUDED.applied_seq`;
    return written > 0;
  }
}
