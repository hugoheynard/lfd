import { Body, Controller, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  setVariantMinQuantitiesPayloadSchema,
  type SetVariantMinQuantitiesPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { SetProductMinQuantitiesCommand } from "../application/set-product-min-quantities.js";

/**
 * **La quantité minimale d'une déclinaison** (`plan-quantite-minimale.md`, M1)
 * — sous le même préfixe et le même mur que les fiches, dans son propre
 * contrôleur : `ProductController` dépasse déjà la taille d'un fichier, et ce
 * geste s'enregistre hors de « Tout enregistrer », comme l'audience.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductMinQuantitiesController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Un `PUT` de remplacement : l'écran envoie la grille qu'il affiche — une
   * grille vide retire tout minimum — ou `"follow"`, qui suit le défaut.
   */
  @Put(":id/variants/:variantId/min-quantities")
  async setVariantMinQuantities(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body(new ZodBody(setVariantMinQuantitiesPayloadSchema)) body: SetVariantMinQuantitiesPayload,
  ) {
    await this.commands.execute<SetProductMinQuantitiesCommand, void>(
      new SetProductMinQuantitiesCommand(id, variantId, body.minQuantities),
    );
    return { id, variantId };
  }
}
