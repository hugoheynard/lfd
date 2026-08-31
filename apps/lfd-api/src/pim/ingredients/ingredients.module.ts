import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import {
  CreateAppellationHandler,
  RemoveAppellationHandler,
  UpdateAppellationHandler,
} from "./application/appellation-handlers.js";
import {
  CreateIngredientHandler,
  RemoveIngredientHandler,
  UpdateIngredientHandler,
} from "./application/ingredient-handlers.js";
import { SetProductIngredientsHandler } from "./application/set-product-ingredients.js";
import { AppellationRepository } from "./domain/ports/appellation.repository.js";
import { IngredientRepository } from "./domain/ports/ingredient.repository.js";
import { IngredientController } from "./http/ingredient.controller.js";
import { PrismaAppellationRepository } from "./infrastructure/prisma-appellation.repository.js";
import { PrismaIngredientRepository } from "./infrastructure/prisma-ingredient.repository.js";

/**
 * Contexte **ingredients** — la provenance de ce qu'on vend.
 *
 * Il est frère des contextes de vente et des points de vente : un référentiel
 * qu'on règle une fois et que les fiches citent. Comme eux, il vit à côté du
 * catalogue et non dedans — le catalogue le CITE, il ne le possède pas.
 *
 * Il n'exporte rien pour l'instant : personne d'autre que son écran ne le lit.
 * Le jour où un canal projettera les badges d'appellation, il exportera un
 * lecteur — et ce jour-là seulement.
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [IngredientController],
  providers: [
    CreateAppellationHandler,
    UpdateAppellationHandler,
    RemoveAppellationHandler,
    CreateIngredientHandler,
    UpdateIngredientHandler,
    RemoveIngredientHandler,
    SetProductIngredientsHandler,
    { provide: AppellationRepository, useClass: PrismaAppellationRepository },
    { provide: IngredientRepository, useClass: PrismaIngredientRepository },
  ],
})
export class IngredientsModule {}
