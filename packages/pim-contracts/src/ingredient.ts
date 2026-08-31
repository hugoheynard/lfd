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
