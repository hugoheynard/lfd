import { Injectable } from "@nestjs/common";

import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import { MediaTagReader, MediaTagWriter } from "../domain/ports/media-tags.js";
import {
  tagVocabulary,
  type TagCount,
  type TaggedImage,
} from "../domain/value-objects/tag-vocabulary.js";

/**
 * Le vocabulaire, **compté en mémoire**.
 *
 * ⚠️ `MediaPrismaService` n'expose pas `$queryRaw`, délibérément (une requête
 * brute atteindrait n'importe quel schéma) : un `unnest … GROUP BY` est donc
 * hors d'atteinte. On lit la seule colonne `tags` de toutes les images et on
 * compte ici. Tenable en milliers d'images — quelques dizaines de kilo-octets
 * par lecture. Au-delà de quelques dizaines de milliers, il faudra une vue ou
 * une table de vocabulaire tenue à l'écriture ; rien ne l'annonce avant le
 * temps de réponse de `GET /media/tags`.
 */
@Injectable()
export class PrismaMediaTagReader extends MediaTagReader {
  constructor(private readonly prisma: MediaPrismaService) {
    super();
  }

  async vocabulary(): Promise<readonly TagCount[]> {
    const rows = await this.prisma.mediaAsset.findMany({ select: { tags: true } });
    return tagVocabulary(rows.map((row) => row.tags));
  }

  async imagesTagged(tag: string): Promise<readonly TaggedImage[]> {
    // `has` sert l'index GIN des tags, comme le filtre de la page.
    return this.prisma.mediaAsset.findMany({
      where: { tags: { has: tag } },
      select: { url: true, tags: true },
      orderBy: { url: "asc" },
    });
  }
}

/**
 * Une écriture par image, dans la transaction de l'appelant.
 *
 * ⚠️ Pas d'`array_replace` en une requête, pour la même raison que la lecture :
 * pas de SQL brut. Un mot porté par quelques centaines d'images fait autant
 * d'`UPDATE` courts, dans UNE transaction — tout part ou rien ne part.
 */
@Injectable()
export class PrismaMediaTagWriter extends MediaTagWriter {
  constructor(private readonly prisma: MediaPrismaService) {
    super();
  }

  async retag(images: readonly TaggedImage[]): Promise<void> {
    // Le laissez-passer n'est pas lu : sa seule existence prouve qu'un fait a
    // été posé avant qu'on arrive ici.
    for (const image of images) {
      await this.prisma.mediaAsset.update({
        where: { url: image.url },
        data: { tags: [...image.tags] },
      });
    }
  }
}
