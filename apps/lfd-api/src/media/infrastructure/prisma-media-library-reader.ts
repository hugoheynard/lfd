import { Injectable } from "@nestjs/common";

import { MediaCarriers } from "../channels/carriers/media-carriers.js";
import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import {
  type LibraryQuery,
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
} from "../domain/ports/media-library-reader.js";
import { positionOf } from "../domain/value-objects/library-order.js";
import { MAX_RANKED_IMAGES, rankLibrary } from "../domain/services/rank-library.js";
import type { Prisma } from "../../platform/database/client/client.js";
import { filterOf } from "./library-filter.js";
import { KEYSET_READERS } from "./library-keyset.js";
import { ASSET_COLUMNS, rankedOf, recordOf } from "./library-rows.js";

/**
 * Combien d'URL par question aux porteurs. Une question par paquet plutôt
 * qu'une seule : un `IN` de cinq mille valeurs chez chaque porteur est une
 * requête qu'on ne veut pas écrire, et un paquet par image serait cinq mille
 * allers-retours.
 */
const USES_BATCH = 500;

/**
 * La bibliothèque, **une ligne par image**.
 *
 * `media_asset.url` est unique depuis le 2026-09-23 (`une_image_une_ligne`) :
 * l'URL est l'identité, et la lecture n'a rien à regrouper.
 *
 * Deux chemins (plan L2, 2026-10-10) :
 * - un ordre qui se lit en base (`KEYSET_READERS`) : par clé, `limit + 1`
 *   lignes, total par `count()` ;
 * - l'ordre « emplois » ou le filtre « inutilisées » : les emplois viennent des
 *   porteurs, donc on lit l'URL de tout le fonds filtré (borné à
 *   {@link MAX_RANKED_IMAGES}), on demande les emplois par paquets, et on
 *   classe en mémoire. Le total y reste celui du filtre, « inutilisées »
 *   compris — c'est ce qui le fait passer par ici plutôt que par une page
 *   relue puis éclaircie, qui aurait annoncé un total faux.
 *
 * ⚠️ **Sans une ligne de SQL écrite à la main, et c'est imposé** :
 * `MediaPrismaService` n'expose pas `$queryRaw`, délibérément.
 */
@Injectable()
export class PrismaMediaLibraryReader extends MediaLibraryReader {
  constructor(
    private readonly prisma: MediaPrismaService,
    private readonly carriers: MediaCarriers,
  ) {
    super();
  }

  async page(query: LibraryQuery): Promise<LibraryMediaPage> {
    const where = filterOf(query);
    const keyset = KEYSET_READERS[query.sort];
    if (keyset === undefined || query.unused === true) {
      return this.rankedPage(query, where);
    }
    const [{ rows, more }, total] = await Promise.all([
      keyset(this.prisma, { where, limit: query.limit, offset: query.offset, after: query.after }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    const uses = await this.usesOf(rows.map((row) => row.url));
    const last = rows.at(-1);
    return {
      items: rows.map((row) => recordOf(row, uses.get(row.url) ?? 0)),
      total,
      next:
        more && last !== undefined
          ? positionOf(query.sort, rankedOf(last, uses.get(last.url) ?? 0))
          : null,
    };
  }

  async find(url: string): Promise<LibraryMediaRecord | null> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { url }, select: ASSET_COLUMNS });
    if (row === null) {
      return null;
    }
    const uses = await this.carriers.usesOf([url]);
    return recordOf(row, uses.get(url) ?? 0);
  }

  private async rankedPage(
    query: LibraryQuery,
    where: Prisma.MediaAssetWhereInput,
  ): Promise<LibraryMediaPage> {
    // Un de plus que la borne : c'est lui qui dit qu'on la dépasse.
    const candidates = await this.prisma.mediaAsset.findMany({
      where,
      select: { url: true, name: true, createdAt: true },
      take: MAX_RANKED_IMAGES + 1,
    });
    const uses = await this.usesOf(candidates.map((candidate) => candidate.url));
    const ranked = rankLibrary(
      candidates.map((candidate) => rankedOf(candidate, uses.get(candidate.url) ?? 0)),
      {
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
        after: query.after,
        unused: query.unused,
      },
    );
    const rows = await this.prisma.mediaAsset.findMany({
      where: { url: { in: ranked.images.map((image) => image.url) } },
      select: ASSET_COLUMNS,
    });
    const byUrl = new Map(rows.map((row) => [row.url, row]));
    // Une image retirée entre les deux lectures disparaît de la page, sans
    // trou ni erreur : la position du curseur, elle, reste valable.
    const items = ranked.images.flatMap((image) => {
      const row = byUrl.get(image.url);
      return row === undefined ? [] : [recordOf(row, image.uses)];
    });
    return { items, total: ranked.total, next: ranked.next };
  }

  /** Les emplois, par paquets — le silence d'un porteur fait échouer, jamais zéro. */
  private async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const uses = new Map<string, number>();
    for (let start = 0; start < urls.length; start += USES_BATCH) {
      const answer = await this.carriers.usesOf(urls.slice(start, start + USES_BATCH));
      for (const [url, count] of answer) {
        uses.set(url, count);
      }
    }
    return uses;
  }
}
