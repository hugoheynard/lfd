import { ArchivedAllergenDeclaredError } from "../../../allergens/domain/errors/allergen-errors.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import {
  allergenDeclaration,
  nutritionValues,
  type AllergenDeclaration,
  type NutritionDeclaration,
  type NutritionValues,
} from "../domain/value-objects/nutrition-declaration.js";

/** Les codes qu'un formulaire envoie — présents et traces. */
export interface AllergensInput {
  readonly allergens: readonly string[];
  readonly mayContain?: readonly string[] | undefined;
}

/**
 * Ce qu'un formulaire envoie pour une fiche réglementaire **entière**.
 *
 * Il n'en reste qu'un seul émetteur : l'ouverture d'un produit, qui pose les
 * deux moitiés d'un même geste. La (re)déclaration d'une déclinaison, elle, est
 * passée à deux verbes — un par moitié — le 2026-09-22.
 */
export interface DeclarationInput extends AllergensInput {
  readonly nutrition?: NutritionValues | undefined;
}

/**
 * Confronte des codes au **référentiel en base**, puis les construit.
 *
 * Deux questions, deux réponses, et les confondre casse la fonctionnalité
 * (D2 bis) :
 *
 * - « ce code est-il valide ? » — oui, **archivés compris**. `knownCodes()` les
 *   rend, et la fabrique du domaine s'en contente : une déclaration écrite hier
 *   cite un code que le staff archive demain, et la relire ne doit pas
 *   invalider l'étiquette d'un produit déjà servi ;
 * - « peut-on l'ajouter ? » — non s'il est archivé. Le refus est **ici** et pas
 *   dans le value object, parce qu'il dépend de ce que la fiche déclarait
 *   **déjà** : `SaveVariantAllergens` revalide la déclaration entière à chaque
 *   enregistrement, si bien qu'un refus sec ferait échouer le retrait d'un
 *   autre code sur un code archivé que personne n'a touché.
 *
 * Les codes archivés se lisent sur `catalogue()` et non sur un troisième port :
 * une entrée sous une catégorie archivée est forcément archivée elle-même —
 * `ensureCategoryUncited` refuse d'archiver une catégorie qui accueille encore
 * une entrée proposée.
 *
 * @param alreadyDeclared les codes que la fiche portait avant ce geste,
 *   `may_contain` compris. Vide à la création : tout y est un ajout.
 * @throws {UnknownAllergenError} un code que le référentiel ne connaît pas.
 * @throws {ArchivedAllergenDeclaredError} un code archivé ajouté à neuf.
 */
export async function validatedAllergens(
  reference: AllergenCatalogueReader,
  input: AllergensInput,
  alreadyDeclared: readonly string[],
): Promise<AllergenDeclaration> {
  const [knownCodes, catalogue] = await Promise.all([
    reference.knownCodes(),
    reference.catalogue(),
  ]);
  const declaration = allergenDeclaration(input.allergens, input.mayContain ?? [], knownCodes);

  const archived = new Set(
    catalogue.flatMap((category) =>
      category.entries.filter((entry) => entry.archivedAt !== null).map((entry) => entry.code),
    ),
  );
  const kept = new Set(alreadyDeclared);
  for (const code of [...declaration.allergens, ...declaration.mayContain]) {
    if (archived.has(code) && !kept.has(code)) {
      throw new ArchivedAllergenDeclaredError(code);
    }
  }
  return declaration;
}

/**
 * La fiche **entière**, validée — les codes contre le référentiel, les valeurs
 * contre elles-mêmes. Réservée au geste qui pose les deux moitiés à la fois.
 */
export async function validatedDeclaration(
  reference: AllergenCatalogueReader,
  input: DeclarationInput,
  alreadyDeclared: readonly string[],
): Promise<NutritionDeclaration> {
  const declaration = await validatedAllergens(reference, input, alreadyDeclared);
  return { ...declaration, ...nutritionValues(input.nutrition ?? {}) };
}
