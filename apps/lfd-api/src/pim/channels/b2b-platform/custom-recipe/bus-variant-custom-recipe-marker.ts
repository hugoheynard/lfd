import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { SetVariantCustomRecipeCommand } from "../../../catalogue/product/index.js";
import {
  VariantCustomRecipeMarker,
  type CustomRecipeTarget,
} from "./variant-custom-recipe-marker.js";

/** Le geste de la fiche, par le bus : le même chemin que la carte « Produit sur mesure ». */
@Injectable()
export class BusVariantCustomRecipeMarker extends VariantCustomRecipeMarker {
  constructor(private readonly commands: CommandBus) {
    super();
  }

  async markCustomRecipe(target: CustomRecipeTarget): Promise<void> {
    await this.commands.execute<SetVariantCustomRecipeCommand, void>(
      new SetVariantCustomRecipeCommand(target.productId, target.variantId, true),
    );
  }
}
