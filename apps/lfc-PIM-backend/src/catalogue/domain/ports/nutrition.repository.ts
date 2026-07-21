import type { NutritionDeclaration } from '../value-objects/nutrition-declaration.js';

/** Écriture de la fiche réglementaire d'une déclinaison (doc 03). */
export abstract class NutritionRepository {
  abstract declare(
    variantId: string,
    declaration: NutritionDeclaration,
  ): Promise<void>;
}
