import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import type { CategorySnapshot } from "../domain/entities/category.js";
import { AllCategoriesReader } from "../domain/ports/all-categories.reader.js";
import { CATEGORY_WITH_VAT, toCategory } from "./prisma-category.repository.js";

/**
 * L'adaptateur : la requête et le mapper du dépôt des familles, pour que la
 * lecture et l'écriture relisent une famille de la même façon — l'agrégat
 * revalide la ligne, puis seul son instantané sort.
 */
@Injectable()
export class PrismaAllCategoriesReader extends AllCategoriesReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async all(): Promise<CategorySnapshot[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ position: "asc" }],
      include: CATEGORY_WITH_VAT,
    });
    return rows.map((row) => toCategory(row).snapshot());
  }
}
