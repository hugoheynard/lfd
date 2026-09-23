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
      select: { role: true, mediaUrl: true },
    });
    const urls = [...new Set(rows.flatMap((row) => (row.mediaUrl === null ? [] : [row.mediaUrl])))];
    if (urls.length === 0) {
      return [];
    }
    // 🔴 Une seconde requête plutôt qu'un `include` : le rattachement ne
    // désigne plus une LIGNE d'actif mais une image, par son URL. La relation
    // disparaîtra au déploiement ③ avec la clé étrangère, et c'est aussi la
    // forme que prendra le port le jour où la bibliothèque sera un bloc.
    const assets = await this.prisma.mediaAsset.findMany({
      where: { url: { in: urls } },
      select: {
        url: true,
        name: true,
        alt: true,
        width: true,
        height: true,
        bytes: true,
        contentType: true,
      },
    });
    const byUrl = new Map(assets.map((asset) => [asset.url, asset]));

    return rows.flatMap((row) => {
      const asset = row.mediaUrl === null ? undefined : byUrl.get(row.mediaUrl);
      // Un rattachement sans image n'est pas rendu : il ne peut naître que
      // d'une ligne antérieure au report de l'URL, et un visuel cassé sur une
      // famille publiée coûte plus que son absence.
      return asset === undefined
        ? []
        : [
            {
              role: row.role,
              url: asset.url,
              name: asset.name,
              // Le repli sur l'URL vaut mieux qu'une chaîne vide : une
              // alternative absente doit se VOIR, pas se confondre avec une
              // alternative écrite.
              alt: localizedOf(asset.alt) ?? { [SOURCE_LOCALE]: asset.url },
              width: asset.width,
              height: asset.height,
              bytes: asset.bytes,
              contentType: asset.contentType,
            },
          ];
    });
  }
}
