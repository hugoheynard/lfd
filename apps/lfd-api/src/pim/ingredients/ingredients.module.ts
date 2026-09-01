import { Module } from "@nestjs/common";

import { AllergensModule } from "../allergens/allergens.module.js";
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
import { ListAppellationsHandler } from "./application/list-appellations.js";
import { ListIngredientsHandler } from "./application/list-ingredients.js";
import { ReadProductIngredientAllergensHandler } from "./application/read-product-ingredient-allergens.js";
import { ReadProductIngredientsHandler } from "./application/read-product-ingredients.js";
import { SetIngredientAllergensHandler } from "./application/set-ingredient-allergens.js";
import { SetProductIngredientsHandler } from "./application/set-product-ingredients.js";
import { AppellationRepository } from "./domain/ports/appellation.repository.js";
import { IngredientRepository } from "./domain/ports/ingredient.repository.js";
import { VariantDeclarationReader } from "./domain/ports/variant-declaration.reader.js";
import { AppellationController } from "./http/appellation.controller.js";
import { IngredientController } from "./http/ingredient.controller.js";
import { PrismaAppellationRepository } from "./infrastructure/prisma-appellation.repository.js";
import { PrismaIngredientRepository } from "./infrastructure/prisma-ingredient.repository.js";
import { PrismaVariantDeclarationReader } from "./infrastructure/prisma-variant-declaration.reader.js";

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
  // `AllergensModule` pour son seul lecteur de catalogue : poser un allergène
  // sur une matière suppose de savoir ce que le référentiel reconnaît, et ce
  // qu'il ne propose plus (D2 bis). Il n'expose aucun dépôt d'écriture — la
  // provenance lit le référentiel, elle ne l'administre pas.
  imports: [PimDatabaseModule, AllergensModule],
  controllers: [IngredientController, AppellationController],
  providers: [
    CreateAppellationHandler,
    UpdateAppellationHandler,
    RemoveAppellationHandler,
    CreateIngredientHandler,
    UpdateIngredientHandler,
    RemoveIngredientHandler,
    SetProductIngredientsHandler,
    SetIngredientAllergensHandler,
    ListAppellationsHandler,
    ListIngredientsHandler,
    ReadProductIngredientsHandler,
    ReadProductIngredientAllergensHandler,
    { provide: AppellationRepository, useClass: PrismaAppellationRepository },
    { provide: IngredientRepository, useClass: PrismaIngredientRepository },
    { provide: VariantDeclarationReader, useClass: PrismaVariantDeclarationReader },
  ],
})
export class IngredientsModule {}
