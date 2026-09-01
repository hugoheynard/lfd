import { z } from "zod";

import { localizedTextSchema } from "./localized.js";
import type { LocalizedText } from "./shared.js";

/**
 * Contrat de fil des **ingrédients** et des **appellations**.
 *
 * ⚠️ Ce n'est PAS la liste réglementaire d'ingrédients au sens du règlement UE
 * 1169/2011 — celle-là est ordonnée par masse décroissante, porte des
 * quantités, décrit une recette, et appartient donc à la déclinaison
 * (`NutritionDeclaration`). Ce qui se déclare ici est d'où vient ce qu'il y a
 * dedans : une matière éditoriale et commerciale, portée par le PRODUIT.
 *
 * La note qui tranche : `documentation/pim/ingredients-et-appellations.md`.
 */

/** Forme d'une identité de référentiel — minuscules, chiffres et tirets. */
const referenceKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, {
    message: "L'identité n'accepte que des minuscules, des chiffres et des tirets.",
  });

/**
 * Le **signe officiel** que porte une appellation — AOP, IGP, Label Rouge, AB.
 *
 * Une chaîne libre et non une énumération : c'est un libellé qu'on lit sur un
 * badge, pas une valeur sur laquelle le code branche. En faire une énumération
 * obligerait un déploiement pour reconnaître un signe de plus, ce qui est
 * précisément le défaut que ce référentiel existe pour éviter.
 */
const schemeSchema = z.string().trim().max(64);

/** Ouvrir une appellation. Le `code` est une identité : il ne change plus. */
export const createAppellationPayloadSchema = z.object({
  code: referenceKeySchema,
  label: localizedTextSchema,
  scheme: schemeSchema,
});
export type CreateAppellationPayload = z.infer<typeof createAppellationPayloadSchema>;

/** Régler une appellation — tout sauf son code. */
export const updateAppellationPayloadSchema = z.object({
  label: localizedTextSchema.optional(),
  scheme: schemeSchema.optional(),
  active: z.boolean().optional(),
});
export type UpdateAppellationPayload = z.infer<typeof updateAppellationPayloadSchema>;

/** Une appellation telle que l'écran la lit. */
export interface AppellationView {
  readonly code: string;
  readonly label: LocalizedText;
  readonly scheme: string;
  readonly active: boolean;
  /**
   * Combien d'ingrédients la citent — ce qui la RETIENT.
   *
   * L'écran doit le dire avant le geste plutôt que de laisser le refus
   * l'apprendre après le clic.
   */
  readonly usedBy: number;
}

/** Déclarer un ingrédient. La `key` est une identité : elle ne change plus. */
export const createIngredientPayloadSchema = z.object({
  key: referenceKeySchema,
  name: localizedTextSchema,
  /**
   * `nullish` et non `optional` : les trois états sont distincts et l'écran a
   * besoin des trois. Absent (ou `undefined`) = « ne touche pas », `null` =
   * « efface », un texte = « pose celui-là ». Le contrat des textes facultatifs
   * du catalogue, lui, ramène les deux premiers à un seul — c'est bon pour une
   * section qui renvoie la fiche entière, et faux ici, où un champ vidé doit
   * pouvoir effacer.
   */
  description: localizedTextSchema.nullish(),
  /**
   * L'origine géographique — « Savoie, France ».
   *
   * Une chaîne, pas une table de lieux : rien ne la calcule, ne la filtre ni
   * ne la géocode. Une table répondrait à une question que personne ne pose
   * encore.
   */
  origin: z.string().trim().max(160),
  /** Le signe officiel, s'il y en a un — la farine du moulin d'à côté n'en a pas. */
  appellationCode: referenceKeySchema.nullish(),
});
export type CreateIngredientPayload = z.infer<typeof createIngredientPayloadSchema>;

/** Régler un ingrédient — tout sauf sa clé. */
export const updateIngredientPayloadSchema = z.object({
  name: localizedTextSchema.optional(),
  description: localizedTextSchema.nullish(),
  origin: z.string().trim().max(160).optional(),
  appellationCode: referenceKeySchema.nullish(),
});
export type UpdateIngredientPayload = z.infer<typeof updateIngredientPayloadSchema>;

/** Un ingrédient tel que l'écran le lit. */
export interface IngredientView {
  readonly key: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly origin: string;
  /** L'appellation citée, résolue — `null` si l'ingrédient n'en porte pas. */
  readonly appellation: AppellationView | null;
  /**
   * Les codes d'allergènes que cette matière **contient**, en codes GS1 — jamais
   * de libellés : la projection vers la mention d'étiquette appartient à qui
   * affiche, et le référentiel des libellés se lit à part
   * (`GET /pim/reference/allergens`).
   *
   * Périmètre `world` (D4) : `BWD`, `NM`, `SO` et les entrées maison y ont leur
   * place. Un ingrédient énonce un FAIT, pas une obligation européenne — le
   * filtre légal appartient à la déclaration de la déclinaison.
   *
   * ⚠️ `[]` n'affirme RIEN. Contrairement à `NutritionDeclaration.allergens`,
   * où la liste vide est une déclaration positive « aucun allergène », une
   * matière sans code veut seulement dire que personne n'en a saisi.
   */
  readonly allergens: readonly string[];
  /** Combien de fiches le citent — ce qui le retient à l'effacement. */
  readonly usedBy: number;
}

/**
 * Ce qu'une fiche déclare : des clés d'ingrédients, **dans l'ordre affiché**.
 *
 * L'ordre est une décision éditoriale — « beurre de Savoie AOP » en premier
 * parce que c'est l'argument — et non l'ordre réglementaire par masse, qui
 * appartient à la déclaration nutritionnelle de la déclinaison.
 */
export const setProductIngredientsPayloadSchema = z.object({
  keys: z.array(referenceKeySchema).max(50),
});
export type SetProductIngredientsPayload = z.infer<typeof setProductIngredientsPayloadSchema>;

/**
 * Un code d'allergène tel qu'il arrive sur le fil. La graphie et l'EXISTENCE
 * sont jugées par le domaine et le référentiel : les redire ici en ferait deux
 * sources de vérité, dont une que personne ne penserait à corriger.
 */
const allergenCodeSchema = z.string().trim().min(1).max(48);

/**
 * Ce qu'une matière contient : la liste **entière**, comme la liste des
 * ingrédients d'une fiche.
 *
 * Un ENSEMBLE et non une suite ordonnée : « contient des noisettes et du
 * gluten » ne se lit pas dans un ordre. Le doublon et le rang sont donc
 * normalisés par le domaine, et l'écran n'a pas de tri à défendre.
 */
export const setIngredientAllergensPayloadSchema = z.object({
  codes: z.array(allergenCodeSchema).max(50),
});
export type SetIngredientAllergensPayload = z.infer<typeof setIngredientAllergensPayloadSchema>;

/**
 * Ce qu'une déclinaison DÉCLARE, en regard de ce que la composition du produit
 * mentionne.
 *
 * @see ProductIngredientAllergensView pour ce que le silence de ces champs ne
 *   dit pas.
 */
export interface VariantAllergenGapView {
  readonly variantId: string;
  /**
   * Les codes de la fiche réglementaire. `null` = **aucune fiche déclarée**, à
   * ne pas confondre avec `[]`, qui est l'affirmation « aucun allergène ».
   */
  readonly declaredAllergens: readonly string[] | null;
  /**
   * Les codes cités par la composition du PRODUIT et absents de la déclaration
   * de CETTE déclinaison — une proposition d'ajout, jamais un retrait : un
   * allergène déclaré à la main (contamination croisée d'atelier) n'est pas
   * contredit par une composition qui l'ignore.
   *
   * **Vide quand `declaredAllergens` vaut `null`**, et c'est une règle du
   * contrat, pas un hasard de calcul : fabriquer une fiche réglementaire depuis
   * une liste éditoriale est le geste que l'avertissement de `Ingredient`
   * interdit (D5). Sans fiche, il n'y a rien à reprendre — la fiche se crée à
   * la main, le dérivé n'aide qu'ensuite.
   */
  readonly citedNotDeclared: readonly string[];
}

/**
 * **Ce que la composition d'un produit MENTIONNE** comme allergènes — une aide
 * de saisie, sans aucune valeur de contrôle.
 *
 * 🔴 Trois choses que ce contrat ne dit pas, et qu'aucun écran ne doit lui faire
 * dire (D5) :
 *
 * 1. **Le silence ne vaut rien.** La liste d'ingrédients d'une fiche est
 *    ÉDITORIALE : elle cite « le beurre de Savoie AOP » et tait la farine.
 *    `citedNotDeclared: []` veut donc dire « rien à proposer », jamais « rien à
 *    ajouter », « composition couverte » ni aucune formulation qui se lirait
 *    comme une vérification. Absence de proposition = absence d'information.
 * 2. **La maille est le PRODUIT.** Les ingrédients sont cités par le produit,
 *    la fiche réglementaire est portée par la déclinaison : deux déclinaisons de
 *    recettes différentes — « Tarte 6 pers » et « Tarte 6 pers sans gluten » —
 *    reçoivent le MÊME `citedByIngredients`. Un libellé d'écran parle donc de la
 *    composition du produit, jamais de « ce que cette déclinaison contient ».
 * 3. **Le dérivé propose, la déclaration décide.** Rien ici n'est stocké ni
 *    appliqué : la reprise est un geste explicite du staff, sur la fiche.
 */
export interface ProductIngredientAllergensView {
  readonly productId: string;
  /**
   * L'union des codes portés par les ingrédients que la fiche **produit** cite,
   * dédupliquée et rangée. Vide = les ingrédients cités ne portent aucun code,
   * **ou** la fiche ne cite aucun ingrédient — deux causes que rien ne
   * distingue ici, parce qu'aucune des deux ne renseigne sur le produit.
   */
  readonly citedByIngredients: readonly string[];
  /** Une entrée par déclinaison, dans l'ordre d'affichage du produit. */
  readonly variants: readonly VariantAllergenGapView[];
}
