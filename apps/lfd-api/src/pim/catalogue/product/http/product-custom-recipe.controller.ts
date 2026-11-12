import { Body, Controller, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  setProductCustomRecipePayloadSchema,
  type SetProductCustomRecipePayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { SetProductCustomRecipeCommand } from "../application/set-product-custom-recipe.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";

/**
 * **Sur mesure** — la case de la fiche
 * (`documentation/catalogue/plan-articles-sur-mesure.md` § 13, D1), sous le
 * même préfixe et le même mur que les fiches, dans son propre contrôleur
 * comme les vignettes : `ProductController` dépasse déjà la taille d'un
 * fichier, et la case s'enregistre hors de « Tout enregistrer ».
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductCustomRecipeController {
  constructor(private readonly commands: CommandBus) {}

  /** L'état entier de la case. */
  @Put(":id/custom-recipe")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse la fiche telle quelle, et le journal se tait quand rien n'a changé",
  )
  async setProductCustomRecipe(
    @Param("id") id: string,
    @Body(new ZodBody(setProductCustomRecipePayloadSchema))
    body: SetProductCustomRecipePayload,
  ) {
    await this.commands.execute<SetProductCustomRecipeCommand, void>(
      new SetProductCustomRecipeCommand(id, body.customRecipe),
    );
    return { id };
  }
}
