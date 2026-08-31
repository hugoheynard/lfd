import { UnknownIncoCategoryError } from "../errors/allergen-errors.js";
import type { IncoCategory } from "../../allergen-mapping.js";

export type { IncoCategory };

/**
 * **Les 14 de l'annexe II, en donnée** — la même union, énumérable.
 *
 * L'union reste la source du TYPE (D1 : elle est du droit, elle ne bouge pas au
 * rythme d'une saisie) ; il manquait seulement de quoi la parcourir à
 * l'exécution, faute de quoi une colonne texte relue en base ne pourrait
 * rentrer dans l'union qu'à coups d'assertion.
 *
 * L'ordre est celui de l'annexe, donc celui du semis. Sa **complétude** est
 * tenue par un test qui la confronte au référentiel : une 15ᵉ catégorie ajoutée
 * à l'union sans être ajoutée ici se signale là.
 */
export const INCO_CATEGORIES: readonly IncoCategory[] = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "tree_nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
];

/**
 * Reconnaît la valeur d'une colonne `inco_category`, ou refuse.
 *
 * `null` traverse : c'est l'état normal d'une catégorie maison **et** de la
 * catégorie « hors obligation UE ». Les deux ne portent pas d'obligation de
 * déclaration, et c'est exactement ce que `null` dit ici — `official` dit autre
 * chose, ailleurs.
 *
 * Une recherche dans la liste plutôt qu'un ensemble et une assertion : c'est ce
 * qui rend la valeur rendue typée **sans cast**, et quatorze comparaisons ne se
 * mesurent pas.
 *
 * @throws {UnknownIncoCategoryError} la colonne porte une valeur hors annexe II.
 */
export function toIncoCategory(raw: string | null): IncoCategory | null {
  if (raw === null) {
    return null;
  }
  const known = INCO_CATEGORIES.find((category) => category === raw);
  if (known === undefined) {
    throw new UnknownIncoCategoryError(raw);
  }
  return known;
}
