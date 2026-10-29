import { Body, Controller, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  setProductVariantsAsTilesPayloadSchema,
  type SetProductVariantsAsTilesPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { SetProductVariantsAsTilesCommand } from "../application/set-product-variants-as-tiles.js";

/**
 * **Montrer chaque déclinaison en vignette** au rayon
 * (`documentation/catalogue/plan-declinaisons-en-vignette.md`, V1) — sous le
 * même préfixe et le même mur que les fiches, dans son propre contrôleur comme
 * la quantité minimale : `ProductController` dépasse déjà la taille d'un
 * fichier, et la case s'enregistre hors de « Tout enregistrer ».
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductVariantsAsTilesController {
  constructor(private readonly commands: CommandBus) {}

  /** L'état entier de la case, comme le froid. */
  @Put(":id/variants-as-tiles")
  async setProductVariantsAsTiles(
    @Param("id") id: string,
    @Body(new ZodBody(setProductVariantsAsTilesPayloadSchema))
    body: SetProductVariantsAsTilesPayload,
  ) {
    await this.commands.execute<SetProductVariantsAsTilesCommand, void>(
      new SetProductVariantsAsTilesCommand(id, body.variantsAsTiles),
    );
    return { id };
  }
}
