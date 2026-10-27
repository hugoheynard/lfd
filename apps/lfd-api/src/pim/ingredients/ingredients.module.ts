import { Module } from "@nestjs/common";

import { AllergensModule } from "../allergens/allergens.module.js";
import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { CreateAppellationHandler } from "./application/create-appellation.js";
import { CreateIngredientHandler } from "./application/create-ingredient.js";
import { ListAppellationsHandler } from "./application/list-appellations.js";
import { ListIngredientsHandler } from "./application/list-ingredients.js";
import { ReadProductIngredientsHandler } from "./application/read-product-ingredients.js";
import { RemoveAppellationHandler } from "./application/remove-appellation.js";
import { RemoveIngredientHandler } from "./application/remove-ingredient.js";
import { SetIngredientAllergensHandler } from "./application/set-ingredient-allergens.js";
import { SetProductIngredientsHandler } from "./application/set-product-ingredients.js";
import { UpdateAppellationHandler } from "./application/update-appellation.js";
import { UpdateIngredientHandler } from "./application/update-ingredient.js";
import { AppellationRepository } from "./domain/ports/appellation.repository.js";
import { IngredientRepository } from "./domain/ports/ingredient.repository.js";
import { AppellationController } from "./http/appellation.controller.js";
import { IngredientController } from "./http/ingredient.controller.js";
import { PrismaAppellationRepository } from "./infrastructure/prisma-appellation.repository.js";
import { PrismaIngredientRepository } from "./infrastructure/prisma-ingredient.repository.js";
import { PrismaCitedAllergensReader } from "./infrastructure/prisma-cited-allergens.reader.js";

/**
 * Contexte **ingredients** — la provenance de ce qu'on vend.
 *
 * Il est frère des contextes de vente et des points de vente : un référentiel
 * qu'on règle une fois et que les fiches citent. Comme eux, il vit à côté du
 * catalogue et non dedans — le catalogue le CITE, il ne le possède pas.
 *
 * Il n'exporte qu'un lecteur : ce que les fiches citent comme allergènes,
 * que le catalogue déclare (`CitedAllergensReader`) pour juger une fiche.
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
    { provide: AppellationRepository, useClass: PrismaAppellationRepository },
    { provide: IngredientRepository, useClass: PrismaIngredientRepository },
    PrismaCitedAllergensReader,
  ],
  // L'adaptateur du port que le CATALOGUE déclare (`CitedAllergensReader`).
  // Exporté, pas fourni sous son token : c'est la racine qui relie les deux
  // côtés (`appBootstrap/cited-allergens-feed.module.ts`).
  exports: [PrismaCitedAllergensReader],
})
export class IngredientsModule {}
