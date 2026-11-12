import { Injectable } from "@nestjs/common";

import { journalVersion } from "../../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogAdminChangeVersionReader } from "../domain/ports/catalog-admin-change-version.reader.js";

/** `max(id)` et `count(*)` de `public.catalog_admin_change`, en une requête. */
@Injectable()
export class PrismaCatalogAdminChangeVersionReader extends CatalogAdminChangeVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(): Promise<number> {
    const found = await this.prisma.catalogAdminChange.aggregate({
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
