import { Body, Controller, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  setVariantAudiencePayloadSchema,
  type SetVariantAudiencePayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { SetVariantAudienceCommand } from "../variants/set-variant-audience.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";

/**
 * **À qui une déclinaison vend**
 * (`documentation/catalogue/plan-audience-par-declinaison.md`, A1), sous le
 * même préfixe et le même mur que les fiches, dans son propre contrôleur comme
 * le sur mesure : le sélecteur s'enregistre hors de « Tout enregistrer ».
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class VariantAudienceController {
  constructor(private readonly commands: CommandBus) {}

  /** L'audience propre de la déclinaison, ou `null` pour suivre la fiche. */
  @Put(":id/variants/:variantId/audience")
  @Idempotent(
    "pose une valeur : rejouée, la même requête laisse la déclinaison telle quelle, et le journal se tait quand rien n'a changé",
  )
  async setVariantAudience(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body(new ZodBody(setVariantAudiencePayloadSchema)) body: SetVariantAudiencePayload,
  ) {
    await this.commands.execute<SetVariantAudienceCommand, void>(
      new SetVariantAudienceCommand(id, variantId, body.audience),
    );
    return { id, variantId };
  }
}
