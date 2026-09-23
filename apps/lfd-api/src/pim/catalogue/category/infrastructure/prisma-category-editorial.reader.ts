import { Injectable } from "@nestjs/common";

import { optionalLocalizedColumn as localizedOf } from "../../shared/infrastructure/json-readers.js";
import { ImageCatalogue } from "../../../channels/media/image-catalogue.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  CategoryEditorialReader,
  type CategoryEditorialView,
  type CategoryMediaRecord,
} from "../domain/ports/category-editorial-reader.js";

@Injectable()
export class PrismaCategoryEditorialReader extends CategoryEditorialReader {
  constructor(
    private readonly prisma: PimPrismaService,
    private readonly images: ImageCatalogue,
  ) {
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
      select: { role: true, mediaUrl: true },
    });
    // 🔴 La bibliothèque répond par un PORT : une famille cite des URL, elle ne
    // lit pas la table des images. Elle ne la possède pas plus qu'une fiche.
    const images = await this.images.describe(
      rows.flatMap((row) => (row.mediaUrl === null ? [] : [row.mediaUrl])),
    );

    return rows.flatMap((row) => {
      const image = row.mediaUrl === null ? undefined : images.get(row.mediaUrl);
      // Un rattachement sans image n'est pas rendu : il ne peut naître que
      // d'une ligne antérieure au report de l'URL, et un visuel cassé sur une
      // famille publiée coûte plus que son absence.
      return image === undefined ? [] : [{ role: row.role, ...image }];
    });
  }
}
