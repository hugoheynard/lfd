import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CategoryNamesReader, type CategoryName } from "../domain/ports/category-names.reader.js";

/** Une requête pour tout le lot ; un lot vide ne touche pas la base. */
@Injectable()
export class PrismaCategoryNamesReader extends CategoryNamesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async namesOf(ids: readonly string[]): Promise<readonly CategoryName[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.catalogCategory.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
  }
}
