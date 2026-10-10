import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { type ReplaceMediaPayload, replaceMediaPayloadSchema } from "@lfd/pim-contracts";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { ReplaceMediaCommand } from "../application/replace-media.js";

/**
 * **Remplacer une image du fonds** (L7, 2026-10-10) — `POST /media/replace`.
 *
 * Son propre contrôleur : celui du fonds frôle la borne des 300 lignes, et ce
 * geste n'a rien à partager avec lui que la surface. Même droit,
 * `media_library:write` (le verbe n'est pas `GET`).
 *
 * Rend 204 et rien d'autre (CQRS) : l'écran relit `GET /media/carriers` pour
 * l'une et l'autre image. Le compte des porteurs repointés est au journal.
 *
 * Pas de route « déposer et remplacer » : le dépôt écrit dans le bucket hors
 * transaction, et le combiner ici ne ferait gagner qu'un aller-retour, au prix
 * d'un multipart et d'un échec à deux moitiés à expliquer (l'image entrée au
 * fonds, le remplacement refusé). Deux appels disent chacun leur refus.
 */
@AdminSurface("media_library")
@Controller("media/replace")
export class MediaReplaceController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(204)
  async replace(
    @Body(new ZodBody(replaceMediaPayloadSchema)) payload: ReplaceMediaPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReplaceMediaCommand, void>(
      new ReplaceMediaCommand(payload.from, payload.to, staffUserId),
    );
  }
}
