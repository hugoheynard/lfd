import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  MediaLibrary,
  type MediaFacts,
  type RegisteredMedia,
} from "../domain/ports/media-library.js";
import { localizedColumn } from "../../shared/infrastructure/json-readers.js";
import { localizedText } from "../../shared/domain/value-objects/localized-text.js";

@Injectable()
export class PrismaMediaLibrary extends MediaLibrary {
  constructor(
    private readonly prisma: PimPrismaService,
    private readonly ids: PimIdGenerator,
  ) {
    super();
  }

  async register(entry: Omit<RegisteredMedia, "id">): Promise<RegisteredMedia> {
    const id = this.ids.next();
    await this.prisma.mediaAsset.create({
      data: {
        id,
        url: entry.url,
        // Le texte alternatif se saisit au rattachement, sur la fiche, par
        // quelqu'un qui sait ce que le produit raconte. Au dépôt il n'y a
        // personne pour l'écrire : la colonne est obligatoire, on y met l'URL,
        // comme le fait déjà le rattachement quand le champ est laissé vide.
        alt: localizedColumn(localizedText("texte alternatif", entry.url)),
        storageKey: entry.storageKey,
        contentType: entry.contentType,
        width: entry.width,
        height: entry.height,
        bytes: entry.bytes,
      },
    });
    return { id, ...entry };
  }

  async factsFor(url: string): Promise<MediaFacts | null> {
    // La plus récente : un même contenu redéposé donne la même URL, et c'est la
    // dernière inscription qui reflète ce qu'on vient de mesurer.
    const row = await this.prisma.mediaAsset.findFirst({
      where: { url, storageKey: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { storageKey: true, contentType: true, width: true, height: true, bytes: true },
    });
    return row;
  }
}
