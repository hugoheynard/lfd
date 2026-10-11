import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import {
  mediaPaletteStripQuerySchema,
  type MediaPaletteStripQuery,
  type MediaPaletteStripView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { ReadPaletteStripQuery } from "../application/read-palette-strip.js";

/**
 * **La frise des couleurs** (2026-10-11) — `GET /media/palette-strip`.
 *
 * Son propre contrôleur, comme le rattrapage : celui du fonds frôle la borne
 * des 300 lignes. Même droit que le feed, `media_library:read` (verbe `GET`).
 *
 * Les filtres sont ceux du feed ; `columns` hors de 1..400 → 400.
 */
@AdminSurface("media_library")
@Controller("media/palette-strip")
export class MediaPaletteStripController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  async strip(
    @Query(new ZodQuery(mediaPaletteStripQuerySchema)) query: MediaPaletteStripQuery,
  ): Promise<MediaPaletteStripView> {
    return this.queries.execute<ReadPaletteStripQuery, MediaPaletteStripView>(
      new ReadPaletteStripQuery({
        columns: query.columns,
        q: query.q,
        tags: query.tags,
        from: query.from,
        to: query.to,
        shotFrom: query.shotFrom,
        shotTo: query.shotTo,
        untagged: query.untagged,
        unused: query.unused,
        series: query.series,
      }),
    );
  }
}
