import { Body, Controller, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import type { ReemissionReport } from "../../../catalogue/shared/domain/ports/catalog-reemission.js";
import { PublicationGesture } from "../../../publication/publication-switch.js";
import { ReemitCatalogCommand } from "../application/reemit-catalog.js";

const reemitPayload = z.object({
  /** Une fiche ; absent ou `null` = tout le catalogue. */
  productId: z.string().min(1).nullish(),
});

/**
 * `POST /pim/channels/b2b/reemit` — réémettre une fiche, ou tout (2a6).
 *
 * Un **geste de publication** : il envoie le catalogue dehors, donc il se
 * ferme avec `PIM_PUBLICATION_ENABLED`, comme le push qu'il remplace.
 */
@AdminSurface("pim_channels")
@Controller("reemit")
export class B2bReemitController {
  constructor(private readonly commands: CommandBus) {}

  @PublicationGesture()
  @Post()
  reemit(
    @Body(new ZodBody(reemitPayload)) body: z.infer<typeof reemitPayload>,
  ): Promise<ReemissionReport> {
    return this.commands.execute<ReemitCatalogCommand, ReemissionReport>(
      new ReemitCatalogCommand(body.productId ?? null),
    );
  }
}
