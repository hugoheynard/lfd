import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AutoCollectionEntitiesReader,
  type AutoCollectionEntity,
} from "../domain/ports/auto-collection-entities.reader.js";

/** Les entités vivantes dont la constitution automatique est activée. */
@Injectable()
export class PrismaAutoCollectionEntitiesReader extends AutoCollectionEntitiesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enabled(): Promise<readonly AutoCollectionEntity[]> {
    const rows = await this.prisma.legalEntity.findMany({
      where: { autoCollectionEnabled: true, archivedAt: null },
      orderBy: { id: "asc" },
      select: { id: true, name: true, autoCollectionDelayHours: true },
    });
    return rows.map((row) => ({
      legalEntityId: row.id,
      name: row.name,
      autoCollectionDelayHours: row.autoCollectionDelayHours,
    }));
  }
}
