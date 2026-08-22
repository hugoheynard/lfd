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

/**
 * Combien de lignes, en moyenne, partagent une clé — sert seulement à demander
 * assez de lignes pour espérer `limit` clés distinctes. Un dédoublonnage plus
 * maigre que prévu rend juste une passe plus courte, jamais un résultat faux.
 */
const ROWS_PER_KEY_ESTIMATE = 4;

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

  async findOrphanKeys(before: Date, limit: number): Promise<readonly string[]> {
    // Les LIGNES délaissées : hébergées, sans fiche, et posées avant le délai.
    // Elles ne prouvent encore rien sur l'objet — plusieurs lignes partagent une
    // clé, et il suffit qu'UNE seule soit rattachée pour que l'objet serve.
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        storageKey: { not: null },
        createdAt: { lt: before },
        products: { none: {} },
      },
      select: { storageKey: true },
      orderBy: { createdAt: "asc" },
      // On dédoublonne après coup : `distinct` sur une colonne nullable
      // interdirait le tri par date, qui fait passer les plus anciens d'abord.
      take: limit * ROWS_PER_KEY_ESTIMATE,
    });
    const keys = [
      ...new Set(rows.flatMap((row) => (row.storageKey === null ? [] : [row.storageKey]))),
    ];
    return keys.slice(0, limit);
  }

  async isStillOrphan(storageKey: string, before: Date): Promise<boolean> {
    // UNE requête pour les deux disqualifications : une fiche qui porte la clé,
    // ou une inscription trop fraîche (quelqu'un vient de déposer ce fichier et
    // n'a pas encore enregistré sa section).
    const readers = await this.prisma.mediaAsset.count({
      where: {
        storageKey,
        OR: [{ products: { some: {} } }, { createdAt: { gte: before } }],
      },
    });
    return readers === 0;
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
