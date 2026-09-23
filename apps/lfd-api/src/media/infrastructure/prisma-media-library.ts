import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../pim/infra/database/pim-prisma.service.js";
import { PimIdGenerator } from "../../pim/infra/id/pim-id-generator.js";
import {
  MediaLibrary,
  type MediaFacts,
  type RegisteredMedia,
} from "../domain/ports/media-library.js";
import { localizedColumn } from "../../pim/catalogue/shared/infrastructure/json-readers.js";
import {
  localizedText,
  SOURCE_LOCALE,
} from "../../pim/catalogue/shared/domain/value-objects/localized-text.js";

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
        alt: localizedColumn(localizedText("texte alternatif", { [SOURCE_LOCALE]: entry.url })),
        storageKey: entry.storageKey,
        contentType: entry.contentType,
        width: entry.width,
        height: entry.height,
        bytes: entry.bytes,
      },
    });
    return { id, ...entry };
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
