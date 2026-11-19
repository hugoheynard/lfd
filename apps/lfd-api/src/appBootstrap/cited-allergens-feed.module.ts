import { Global, Module } from "@nestjs/common";

import { CitedAllergensReader } from "../pim/reference/ingredients/domain/ports/cited-allergens.reader.js";
import { IngredientCitationsReader } from "../pim/reference/ingredients/domain/ports/ingredient-citations.reader.js";
import { ProductCompositionCopier } from "../pim/reference/ingredients/domain/ports/product-composition.copier.js";
import { ProductCompositionReader } from "../pim/reference/ingredients/domain/ports/product-composition.reader.js";
import { PrismaProductCompositionReader } from "../pim/reference/ingredients/infrastructure/prisma-product-composition.reader.js";
import { IngredientCompositionCopier } from "../pim/reference/ingredients/infrastructure/ingredient-composition-copier.js";
import { PrismaIngredientCitationsReader } from "../pim/reference/ingredients/infrastructure/prisma-ingredient-citations.reader.js";
import { PrismaCitedAllergensReader } from "../pim/reference/ingredients/infrastructure/prisma-cited-allergens.reader.js";
import { IngredientsModule } from "../pim/reference/ingredients/ingredients.module.js";

/**
 * **Ce que le catalogue demande à la provenance**, relié (2026-10-27) :
 * `CitedAllergensReader` — les allergènes que la composition de chaque fiche
 * cite, pour le jugement unique (`productCompliance`) ; et, depuis le même
 * jour, `IngredientCitationsReader` — les fiches qui citent un ingrédient, pour
 * propager ses allergènes ; et, depuis le 2026-10-29, `ProductCompositionCopier` —
 * la composition recopiée sur un produit né d'une déclinaison détachée
 * (`plan-gestes-de-declinaison.md`, D3) ; et `ProductCompositionReader` — ce
 * qu'une fiche cite, pour sa lignée. Le catalogue déclare, les ingrédients
 * implémentent.
 *
 * Lié ici et non par un import de module : aucun des deux n'importe l'autre,
 * donc pas de cycle, et la frontière reste visible
 * (`documentation/pim/data-model/05-allergenes-gs1-inco.md`).
 */
@Global()
@Module({
  imports: [IngredientsModule],
  providers: [
    { provide: CitedAllergensReader, useExisting: PrismaCitedAllergensReader },
    { provide: IngredientCitationsReader, useExisting: PrismaIngredientCitationsReader },
    { provide: ProductCompositionCopier, useExisting: IngredientCompositionCopier },
    { provide: ProductCompositionReader, useExisting: PrismaProductCompositionReader },
  ],
  exports: [
    CitedAllergensReader,
    IngredientCitationsReader,
    ProductCompositionCopier,
    ProductCompositionReader,
  ],
})
export class CitedAllergensFeedModule {}
