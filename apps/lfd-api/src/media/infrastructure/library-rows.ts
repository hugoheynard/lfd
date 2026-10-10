import { readAltColumn } from "./alt-columns.js";
import { readDayColumn } from "./series-day.js";

import { SOURCE_LOCALE } from "../domain/value-objects/alt-text.js";
import type { RankedImage } from "../domain/value-objects/library-order.js";
import type { LibraryMediaRecord } from "../domain/ports/media-library-reader.js";

/** Ce que la bibliothèque lit d'une image — une ligne, puisque l'URL est unique. */
export const ASSET_COLUMNS = {
  url: true,
  name: true,
  storageKey: true,
  contentType: true,
  width: true,
  height: true,
  bytes: true,
  focalX: true,
  focalY: true,
  tags: true,
  alt: true,
  createdAt: true,
  series: { select: { id: true, title: true, shotOn: true } },
} as const;

/** La série d'une ligne, telle que Prisma la rend. */
interface SeriesRow {
  readonly id: string;
  readonly title: string;
  readonly shotOn: Date | null;
}

export interface AssetRow {
  readonly url: string;
  readonly name: string;
  readonly storageKey: string | null;
  readonly contentType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly focalX: number | null;
  readonly focalY: number | null;
  readonly tags: string[];
  readonly alt: unknown;
  readonly createdAt: Date;
  readonly series: SeriesRow | null;
}

/**
 * Une image telle que la bibliothèque la rend.
 *
 * Le nombre d'emplois vient des PORTEURS, par le port : leurs tables de
 * rattachement leur appartiennent (`lint:prisma-model-ownership`).
 */
export function recordOf(row: AssetRow, uses: number): LibraryMediaRecord {
  return {
    url: row.url,
    name: row.name,
    tags: row.tags,
    // Le repli sur l'URL vaut mieux qu'une chaîne vide : une alternative
    // absente doit se VOIR, pas se confondre avec une alternative écrite.
    alt: readAltColumn(row.alt) ?? { [SOURCE_LOCALE]: row.url },
    storageKey: row.storageKey,
    contentType: row.contentType,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    // `x` et `y` s'écrivent ensemble : un `y` seul n'existe pas.
    focal: row.focalX === null ? null : { x: row.focalX, y: row.focalY ?? 0 },
    uses,
    depositedAt: row.createdAt,
    series:
      row.series === null
        ? null
        : { id: row.series.id, title: row.series.title, shotOn: readDayColumn(row.series.shotOn) },
  };
}

/** Ce qu'un ordre lit d'une ligne. */
export function rankedOf(
  row: {
    readonly url: string;
    readonly name: string;
    readonly createdAt: Date;
    readonly series: { readonly shotOn: Date | null } | null;
  },
  uses: number,
): RankedImage {
  return {
    url: row.url,
    name: row.name,
    depositedAt: row.createdAt,
    uses,
    shotOn: readDayColumn(row.series?.shotOn ?? null),
  };
}
