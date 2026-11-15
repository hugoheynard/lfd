import { type ProductionDisplayPayload, productionDisplayPayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetProductionDisplayCommand } from "../application/commands/set-production-display.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **Le rangement de la fiche d'atelier** — un réglage de l'atelier, servi
 * sous le préfixe et la surface des réglages du fournil
 * (`production_settings`) : l'écran des réglages le pose, et le chemin ne
 * change pas avec le rangement.
 *
 * Il n'injecte qu'un bus. `lint:controller-buses` le tient.
 */
@Controller("admin/production/settings")
@AdminSurface("production_settings")
export class ProductionDisplaySettingsController {
  constructor(private readonly commands: CommandBus) {}

  /** Afficher ou non les sous-catégories en intertitres dans chaque groupe racine. */
  @Put("display")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête trouve un réglage égal et ne sauve ni ne journalise",
  )
  @HttpCode(NO_CONTENT)
  async setDisplay(
    @Body(new ZodBody(productionDisplayPayloadSchema)) body: ProductionDisplayPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetProductionDisplayCommand, void>(
      new SetProductionDisplayCommand(body.showSubcategories, staffUserId),
    );
  }
}
