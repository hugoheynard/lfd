import { Global, Module } from "@nestjs/common";

import { CitedAllergensReader } from "../pim/catalogue/product/domain/ports/cited-allergens.reader.js";
import { PrismaCitedAllergensReader } from "../pim/ingredients/infrastructure/prisma-cited-allergens.reader.js";
import { IngredientsModule } from "../pim/ingredients/ingredients.module.js";

/**
 * **Ce que le catalogue demande à la provenance**, relié (2026-10-27) :
 * `CitedAllergensReader` — les allergènes que la composition de chaque fiche
 * cite, pour le jugement unique (`productCompliance`). Le catalogue déclare,
 * les ingrédients implémentent.
 *
 * Lié ici et non par un import de module : aucun des deux n'importe l'autre,
 * donc pas de cycle, et la frontière reste visible
 * (`documentation/pim/data-model/05-allergenes-gs1-inco.md`).
 */
@Global()
@Module({
  imports: [IngredientsModule],
  providers: [{ provide: CitedAllergensReader, useExisting: PrismaCitedAllergensReader }],
  exports: [CitedAllergensReader],
})
export class CitedAllergensFeedModule {}
