import { ArchivedAllergenDeclaredError } from "../../../allergens/domain/errors/allergen-errors.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import {
  nutritionDeclaration,
  type NutritionDeclaration,
  type NutritionValues,
} from "../domain/value-objects/nutrition-declaration.js";

/**
 * Ce qu'un formulaire envoie pour une fiche réglementaire. Partagé par les deux
 * verbes qui en écrivent une — l'ouverture d'un produit et la (re)déclaration
 * d'une déclinaison — parce que c'est la **même** fiche, saisie au même endroit.
 */
export interface DeclarationInput {
  readonly allergens: readonly string[];
  readonly mayContain?: readonly string[] | undefined;
  readonly nutrition?: NutritionValues | undefined;
}

/**
 * Confronte une fiche au **référentiel en base**, puis la construit.
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
 *   **déjà** : `DeclareProductNutrition` revalide la déclaration entière à
 *   chaque enregistrement, si bien qu'un refus sec ferait échouer un changement
 *   de valeur nutritionnelle sur un code que personne n'a touché.
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
export async function validatedDeclaration(
  reference: AllergenCatalogueReader,
  input: DeclarationInput,
  alreadyDeclared: readonly string[],
): Promise<NutritionDeclaration> {
  const [knownCodes, catalogue] = await Promise.all([
    reference.knownCodes(),
    reference.catalogue(),
  ]);
  const declaration = nutritionDeclaration(
    input.allergens,
    input.mayContain ?? [],
    input.nutrition ?? {},
    knownCodes,
  );

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
