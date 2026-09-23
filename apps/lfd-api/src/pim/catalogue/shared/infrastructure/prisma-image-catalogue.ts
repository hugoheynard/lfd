import { Injectable } from "@nestjs/common";

import { ImageCatalogue, type CatalogueImage } from "../../../channels/media/image-catalogue.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SOURCE_LOCALE } from "../domain/value-objects/localized-text.js";
import { optionalLocalizedColumn as localizedOf } from "./json-readers.js";

/**
 * Ce que la **bibliothèque** répond aux porteurs.
 *
 * C'est le seul endroit du dépôt où la table des images est lue pour le compte
 * d'un porteur. Les trois lectures qui la touchaient directement — les deux
 * éditoriaux et la source des ancres — passent par ici depuis le 2026-09-23.
 */
@Injectable()
export class PrismaImageCatalogue extends ImageCatalogue {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async describe(urls: readonly string[]): Promise<ReadonlyMap<string, CatalogueImage>> {
    const wanted = [...new Set(urls)];
    if (wanted.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.mediaAsset.findMany({
      where: { url: { in: wanted } },
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
    return new Map(
      rows.map((row) => [
        row.url,
        {
          url: row.url,
          name: row.name,
          // Le repli sur l'URL vaut mieux qu'une chaîne vide : une alternative
          // absente doit se VOIR, pas se confondre avec une alternative écrite.
          alt: localizedOf(row.alt) ?? { [SOURCE_LOCALE]: row.url },
          width: row.width,
          height: row.height,
          bytes: row.bytes,
          contentType: row.contentType,
        },
      ]),
    );
  }

  async reference(url: string): Promise<string | null> {
    const row = await this.prisma.mediaAsset.findUnique({
      where: { url },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async has(url: string): Promise<boolean> {
    // `count` et non `findUnique` : on ne veut savoir QUE si elle existe, et
    // ramener ses colonnes pour les jeter ferait payer le transport pour rien.
    return (await this.prisma.mediaAsset.count({ where: { url } })) > 0;
  }
}
