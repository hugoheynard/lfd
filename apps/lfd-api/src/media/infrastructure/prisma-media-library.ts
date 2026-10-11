import { Injectable } from "@nestjs/common";
import { altColumn } from "./alt-columns.js";

import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import { UuidGenerator } from "../../platform/id/uuid-generator.js";
import { isUniqueViolation } from "../../platform/database/json-columns.js";
import { MediaAlreadyRegisteredError } from "../domain/errors/media-library-errors.js";
import {
  MediaLibrary,
  type MediaFacts,
  type RegisteredMedia,
} from "../domain/ports/media-library.js";
import { imageAlt } from "../domain/value-objects/alt-text.js";

@Injectable()
export class PrismaMediaLibrary extends MediaLibrary {
  constructor(
    private readonly prisma: MediaPrismaService,
    private readonly ids: UuidGenerator,
  ) {
    super();
  }

  async register(entry: Omit<RegisteredMedia, "id">): Promise<RegisteredMedia> {
    const id = this.ids.next();
    try {
      await this.insert(id, entry);
    } catch (caught) {
      // L'URL est unique : seul un dépôt simultané des mêmes octets peut la
      // prendre entre la lecture et cette écriture.
      if (isUniqueViolation(caught)) {
        throw new MediaAlreadyRegisteredError(entry.url);
      }
      throw caught;
    }
    return { id, ...entry };
  }

  private async insert(id: string, entry: Omit<RegisteredMedia, "id">): Promise<void> {
    await this.prisma.mediaAsset.create({
      data: {
        id,
        url: entry.url,
        // Le texte alternatif se saisit à la médiathèque, sur l'image (plus
        // sur la fiche depuis le 2026-09-23). Au dépôt personne n'est là pour
        // l'écrire : la colonne est obligatoire, elle porte le repli sur l'URL
        // — la même règle que la description, au domaine (`imageAlt`).
        alt: altColumn(imageAlt(null, entry.url)),
        storageKey: entry.storageKey,
        contentType: entry.contentType,
        width: entry.width,
        height: entry.height,
        bytes: entry.bytes,
        seriesId: entry.seriesId,
      },
    });
  }

  async alreadyRegistered(url: string): Promise<RegisteredMedia | null> {
    return this.prisma.mediaAsset.findUnique({
      where: { url },
      select: {
        id: true,
        url: true,
        storageKey: true,
        contentType: true,
        width: true,
        height: true,
        bytes: true,
        seriesId: true,
      },
    });
  }

  async findCandidates(
    before: Date,
    limit: number,
  ): Promise<readonly { readonly storageKey: string; readonly url: string }[]> {
    // Ce que la bibliothèque SAIT : hébergé, et posé avant le délai de grâce.
    // Elle ne sait pas si une image sert — les tables de rattachement ne sont
    // pas les siennes. C'est le handler qui interroge les porteurs.
    //
    // ⚠️ Cette requête portait `products: { none: {} }` et
    // `categories: { none: {} }` jusqu'au 2026-09-23. Ces relations ont disparu
    // avec la clé étrangère : les laisser aurait fait déclarer ORPHELIN tout le
    // fonds, et supprimer de R2 des images affichées.
    const rows = await this.prisma.mediaAsset.findMany({
      where: { storageKey: { not: null }, createdAt: { lt: before } },
      select: { storageKey: true, url: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.flatMap((row) =>
      row.storageKey === null ? [] : [{ storageKey: row.storageKey, url: row.url }],
    );
  }

  async stillOld(storageKey: string, before: Date): Promise<string | null> {
    // Une inscription FRAÎCHE disqualifie : quelqu'un vient de déposer ce
    // fichier et n'a pas encore enregistré sa section.
    const row = await this.prisma.mediaAsset.findFirst({
      where: { storageKey, createdAt: { lt: before } },
      select: { url: true },
    });
    if (row === null) {
      return null;
    }
    const fresh = await this.prisma.mediaAsset.count({
      where: { storageKey, createdAt: { gte: before } },
    });
    return fresh === 0 ? row.url : null;
  }

  async forget(storageKey: string): Promise<number> {
    const { count } = await this.prisma.mediaAsset.deleteMany({ where: { storageKey } });
    return count;
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
