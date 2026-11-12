import { Injectable } from "@nestjs/common";

import { journalVersion } from "../../../platform/day-versions/journal-version.js";
import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { PimChangeVersionReader } from "../domain/ports/pim-change-version.reader.js";

/** `max(id)` et `count(*)` de `pim.pim_change`, en une requête. */
@Injectable()
export class PrismaPimChangeVersionReader extends PimChangeVersionReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async versionOf(): Promise<number> {
    const found = await this.prisma.pimChange.aggregate({
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
