import { Body, Controller, HttpCode, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { type MediaPalettePayload, mediaPalettePayloadSchema } from "@lfd/pim-contracts";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { PaintMediaPaletteCommand } from "../application/paint-media-palette.js";

/**
 * **Rattraper la palette d'une image** (2026-10-11) — `PUT /media/palette`.
 *
 * Son propre contrôleur, comme le remplacement : celui du fonds frôle la borne
 * des 300 lignes. Même droit, `media_library:write` (le verbe n'est pas `GET`).
 *
 * Rend 204 que la palette ait été posée ou que l'image en ait déjà une : le
 * geste est idempotent, et l'écran relit le feed. Image inconnue → 404.
 */
@AdminSurface("media_library")
@Controller("media/palette")
export class MediaPaletteController {
  constructor(private readonly commands: CommandBus) {}

  @Put()
  @HttpCode(204)
  async paint(
    @Body(new ZodBody(mediaPalettePayloadSchema)) payload: MediaPalettePayload,
  ): Promise<void> {
    await this.commands.execute<PaintMediaPaletteCommand, void>(
      new PaintMediaPaletteCommand(payload.url, payload.palette),
    );
  }
}
