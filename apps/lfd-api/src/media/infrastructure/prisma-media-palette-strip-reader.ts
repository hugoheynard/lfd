import { Injectable } from "@nestjs/common";
import { localToInstant } from "@lfd/contracts";

import { MediaCarriers } from "../channels/carriers/media-carriers.js";
import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import type { LibraryFilter } from "../domain/ports/media-library-reader.js";
import { MediaPaletteStripReader } from "../domain/ports/media-palette-strip-reader.js";
import type { StripImage } from "../domain/services/palette-strip.js";
import { usesInBatches } from "./carrier-uses.js";
import { filterOf } from "./library-filter.js";
import { readPaletteColumn } from "./palette-column.js";
import { readDayColumn } from "./series-day.js";

/** Un jour de prise de vue se place à son début, à l'heure de Paris. */
const DAY_START = "00:00";

/**
 * La frise lue en UNE requête : l'URL, le dépôt, le jour de la série et la
 * palette des images filtrées — rien d'autre.
 *
 * Le tri se fait en mémoire : « prise de vue, sinon dépôt » est un
 * `COALESCE` que le client Prisma n'exprime pas en `orderBy`, et
 * `MediaPrismaService` n'expose pas `$queryRaw`, délibérément.
 *
 * Le filtre « inutilisées » demande les emplois aux porteurs, par paquets,
 * comme le feed : c'est le même filtre.
 */
@Injectable()
export class PrismaMediaPaletteStripReader extends MediaPaletteStripReader {
  constructor(
    private readonly prisma: MediaPrismaService,
    private readonly carriers: MediaCarriers,
  ) {
    super();
  }

  async chronicle(filter: LibraryFilter): Promise<readonly StripImage[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: filterOf(filter),
      select: { url: true, createdAt: true, palette: true, series: { select: { shotOn: true } } },
    });
    const kept = filter.unused === true ? await this.unusedOf(rows) : rows;
    return kept
      .map((row) => ({
        url: row.url,
        takenAt: takenAtOf(row.series?.shotOn ?? null, row.createdAt),
        palette: readPaletteColumn(row.palette),
      }))
      .sort(
        (left, right) =>
          left.takenAt.getTime() - right.takenAt.getTime() ||
          (left.url < right.url ? -1 : left.url > right.url ? 1 : 0),
      );
  }

  private async unusedOf<Row extends { readonly url: string }>(
    rows: readonly Row[],
  ): Promise<readonly Row[]> {
    const uses = await usesInBatches(
      this.carriers,
      rows.map((row) => row.url),
    );
    return rows.filter((row) => (uses.get(row.url) ?? 0) === 0);
  }
}

function takenAtOf(shotOn: Date | null, depositedAt: Date): Date {
  const day = readDayColumn(shotOn);
  return (day === null ? null : localToInstant(day, DAY_START)) ?? depositedAt;
}
