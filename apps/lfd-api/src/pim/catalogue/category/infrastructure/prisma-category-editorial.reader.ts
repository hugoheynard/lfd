import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SOURCE_LOCALE } from "../../shared/domain/value-objects/localized-text.js";
import { optionalLocalizedColumn as localizedOf } from "../../shared/infrastructure/json-readers.js";
import {
  CategoryEditorialReader,
  type CategoryEditorialView,
  type CategoryMediaRecord,
} from "../domain/ports/category-editorial-reader.js";

@Injectable()
export class PrismaCategoryEditorialReader extends CategoryEditorialReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findByCategory(categoryId: string): Promise<CategoryEditorialView | null> {
    const row = await this.prisma.categoryEditorial.findUnique({ where: { categoryId } });
    if (row === null) {
      return null;
    }
    return {
      descriptionShort: localizedOf(row.descriptionShort),
      descriptionLong: localizedOf(row.descriptionLong),
      seoTitle: localizedOf(row.seoTitle),
      seoDescription: localizedOf(row.seoDescription),
    };
  }

  async mediaOf(categoryId: string): Promise<readonly CategoryMediaRecord[]> {
    const rows = await this.prisma.categoryMedia.findMany({
      where: { categoryId },
      orderBy: { position: "asc" },
      include: { media: true },
    });
    return rows.map((row) => ({
      role: row.role,
      url: row.media.url,
      name: row.media.name,
      // Le repli sur l'URL vaut mieux qu'une chaîne vide : une alternative
      // absente doit se VOIR, pas se confondre avec une alternative écrite.
      alt: localizedOf(row.media.alt) ?? { [SOURCE_LOCALE]: row.media.url },
      width: row.media.width,
      height: row.media.height,
      bytes: row.media.bytes,
      contentType: row.media.contentType,
    }));
  }
}
