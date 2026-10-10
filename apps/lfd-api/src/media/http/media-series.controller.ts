import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { mediaSeriesPayloadSchema, type MediaSeriesView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { DeclareMediaSeriesCommand } from "../application/declare-media-series.js";
import { DescribeMediaSeriesCommand } from "../application/describe-media-series.js";
import { ListMediaSeriesQuery } from "../application/list-media-series.js";

/**
 * **Les séries de la médiathèque** (plan L3, 2026-10-10) — ouvrir, corriger,
 * lister. Rattacher une image passe par `PUT /media` (champ `seriesId`), et
 * déposer dans une série par `POST /media` (champ multipart `seriesId`).
 *
 * Même droit que le fonds, `media_library` : `GET` lit, le reste écrit. Le
 * contrôleur ne valide que la FORME ; titre, plafonds et jour sont au domaine.
 */
@AdminSurface("media_library")
@Controller("media/series")
export class MediaSeriesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  async list(): Promise<readonly MediaSeriesView[]> {
    return this.queries.execute<ListMediaSeriesQuery, readonly MediaSeriesView[]>(
      new ListMediaSeriesQuery(),
    );
  }

  /** Rend l'identifiant de la série ouverte, et rien d'autre : l'écran relit. */
  @Post()
  async declare(@Body() body: unknown): Promise<{ readonly id: string }> {
    const payload = mediaSeriesPayloadSchema.parse(body);
    return this.commands.execute<DeclareMediaSeriesCommand, { readonly id: string }>(
      new DeclareMediaSeriesCommand(payload),
    );
  }

  @Put(":id")
  @HttpCode(204)
  async describe(@Param("id") id: string, @Body() body: unknown): Promise<void> {
    const payload = mediaSeriesPayloadSchema.parse(body);
    await this.commands.execute<DescribeMediaSeriesCommand, void>(
      new DescribeMediaSeriesCommand(id, payload),
    );
  }
}
