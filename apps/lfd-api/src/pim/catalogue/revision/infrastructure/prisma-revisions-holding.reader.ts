import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  RevisionsHoldingReader,
  type HeldRevision,
} from "../domain/ports/revisions-holding.reader.js";

/** Une requête, `distinct` par ancre : la photo porte une ligne par article. */
@Injectable()
export class PrismaRevisionsHoldingReader extends RevisionsHoldingReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async holding(skus: readonly string[]): Promise<readonly HeldRevision[]> {
    if (skus.length === 0) {
      return [];
    }
    const rows = await this.prisma.catalogRevisionItem.findMany({
      where: { sku: { in: [...skus] } },
      distinct: ["revisionId"],
      select: { revision: { select: { id: true, hash: true } } },
    });
    return rows.map((row) => ({ id: row.revision.id, hash: row.revision.hash }));
  }
}
