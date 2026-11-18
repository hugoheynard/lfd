import { Body, Controller, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  setVariantCustomRecipePayloadSchema,
  type SetVariantCustomRecipePayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { SetVariantCustomRecipeCommand } from "../variants/set-variant-custom-recipe.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";

/**
 * **Sur mesure** — la case d'une déclinaison
 * (`documentation/catalogue/plan-sur-mesure-par-declinaison.md`, V1), sous le
 * même préfixe et le même mur que les fiches, dans son propre contrôleur comme
 * la quantité minimale : la case s'enregistre hors de « Tout enregistrer ».
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class VariantCustomRecipeController {
  constructor(private readonly commands: CommandBus) {}

  /** L'état entier de la case. */
  @Put(":id/variants/:variantId/custom-recipe")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse la déclinaison telle quelle, et le journal se tait quand rien n'a changé",
  )
  async setVariantCustomRecipe(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body(new ZodBody(setVariantCustomRecipePayloadSchema)) body: SetVariantCustomRecipePayload,
  ) {
    await this.commands.execute<SetVariantCustomRecipeCommand, void>(
      new SetVariantCustomRecipeCommand(id, variantId, body.customRecipe),
    );
    return { id, variantId };
  }
}
