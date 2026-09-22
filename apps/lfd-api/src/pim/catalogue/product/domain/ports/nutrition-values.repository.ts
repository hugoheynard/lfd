import type { WriteTicket } from "../../../../journal/pim-journal.js";
import type { NutritionValues } from "../value-objects/nutrition-declaration.js";

/**
 * Écriture des **valeurs nutritionnelles** d'une déclinaison — et rien d'autre.
 *
 * Le pendant de `VariantAllergensRepository`, pour la raison inverse : écrire
 * une déclaration de sécurité ne doit pas remettre à zéro un tableau
 * nutritionnel que personne n'a rouvert.
 */
export abstract class NutritionValuesRepository {
  abstract save(variantId: string, values: NutritionValues, ticket: WriteTicket): Promise<void>;
}
