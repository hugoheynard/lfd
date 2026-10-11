import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { PALETTE_STRIP_LIMITS, type MediaPaletteStripView } from "@lfd/pim-contracts";

import { MediaPaletteStripReader } from "../domain/ports/media-palette-strip-reader.js";
import { paletteStrip, type StripColumn } from "../domain/services/palette-strip.js";
import { libraryFilterOf, type LibraryFilterCriteria } from "./library-filter-criteria.js";

/** Les filtres du feed, sans page ni tri, et le nombre de colonnes voulu. */
export interface ReadPaletteStripCriteria extends LibraryFilterCriteria {
  readonly columns?: number | undefined;
}

/**
 * **La frise des couleurs** (L9, 2026-10-11) — l'évolution de la colorimétrie
 * du fonds filtré, en au plus {@link PALETTE_STRIP_LIMITS.maxColumns} colonnes.
 */
export class ReadPaletteStripQuery {
  constructor(readonly criteria: ReadPaletteStripCriteria = {}) {}
}

/**
 * Lit le fonds filtré dans l'ordre chronologique, puis le découpe et fusionne
 * en mémoire, en une passe (`paletteStrip`).
 *
 * ⚠️ **Au-delà d'environ 20 000 images filtrées, il faudra pré-agréger**
 * (estimé le 2026-10-11, non mesuré) : chaque ligne lue porte une palette
 * `jsonb` d'environ 300 octets, soit ~6 Mo transférés et revalidés par Zod à
 * chaque ouverture de la médiathèque, plus le tri en mémoire. La réponse,
 * elle, reste bornée par les colonnes. Le jour venu : une palette par
 * semaine tenue à l'écriture, que la frise fusionnerait à son tour.
 */
@QueryHandler(ReadPaletteStripQuery)
export class ReadPaletteStripHandler implements IQueryHandler<
  ReadPaletteStripQuery,
  MediaPaletteStripView
> {
  constructor(private readonly reader: MediaPaletteStripReader) {}

  async execute(query: ReadPaletteStripQuery): Promise<MediaPaletteStripView> {
    const { criteria } = query;
    // Borné ICI aussi : le contrôleur refuse, mais un autre appelant peut se tromper.
    const columns = Math.min(
      Math.max(Math.trunc(criteria.columns ?? PALETTE_STRIP_LIMITS.defaultColumns), 1),
      PALETTE_STRIP_LIMITS.maxColumns,
    );
    const images = await this.reader.chronicle(libraryFilterOf(criteria));
    const strip = paletteStrip(images, columns);
    return { columns: strip.columns.map(viewOf), total: strip.total, unpainted: strip.unpainted };
  }
}

function viewOf(column: StripColumn): MediaPaletteStripView["columns"][number] {
  return {
    from: column.from.toISOString(),
    to: column.to.toISOString(),
    count: column.count,
    palette: column.palette.map((swatch) => ({ ...swatch })),
    sampleUrl: column.sampleUrl,
  };
}
