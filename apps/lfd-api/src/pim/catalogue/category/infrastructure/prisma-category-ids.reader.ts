import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CategoryIdsReader } from "../domain/ports/category-ids.reader.js";

/** L'adaptateur : la seule colonne `id`. */
@Injectable()
export class PrismaCategoryIdsReader extends CategoryIdsReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async allIds(): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.category.findMany({ select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }
}
