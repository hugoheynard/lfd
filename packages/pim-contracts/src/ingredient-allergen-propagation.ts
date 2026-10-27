import { z } from "zod";

/**
 * **Propager l'allergène d'un ingrédient à ses fiches** — le contrat du geste
 * (`documentation/pim/plan-propager-allergenes-d-un-ingredient.md`).
 *
 * La composition PROPOSE, elle ne décide jamais seule (D5) : l'aperçu se lit,
 * puis l'application est un geste explicite. Les codes ne sont jugés ici que
 * dans leur forme ; leur existence appartient au référentiel.
 */

const allergenCodeSchema = z.string().trim().min(1).max(48);
const MAX_CODES = 50;

/** Une liste de codes en paramètre d'URL — `gluten,milk`, vide = aucun. */
const codeListParamSchema = z
  .string()
  .optional()
  .transform((raw) =>
    (raw ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter((code) => code.length > 0),
  )
  .pipe(z.array(allergenCodeSchema).max(MAX_CODES));

/** L'aperçu : ce qui vient d'être AJOUTÉ à l'ingrédient, et ce qui en est RETIRÉ. */
export const ingredientAllergenPropagationQuerySchema = z.object({
  added: codeListParamSchema,
  removed: codeListParamSchema,
});
export type IngredientAllergenPropagationQuery = z.infer<
  typeof ingredientAllergenPropagationQuerySchema
>;

/**
 * L'application. `removalsKept` : les déclinaisons dont la case de retrait a
 * été DÉCOCHÉE — l'allergène y est voulu (contamination d'atelier déclarée à
 * la main). Les ajouts n'ont pas de case : ils réparent une contradiction.
 */
export const applyIngredientAllergenPropagationPayloadSchema = z.object({
  added: z.array(allergenCodeSchema).max(MAX_CODES),
  removed: z.array(allergenCodeSchema).max(MAX_CODES),
  removalsKept: z.array(z.string().min(1)).max(1_000).optional(),
});
export type ApplyIngredientAllergenPropagationPayload = z.infer<
  typeof applyIngredientAllergenPropagationPayloadSchema
>;

/** Une déclinaison qui porte SA PROPRE déclaration — une alignée suit le défaut. */
export interface VariantAllergenPropagationView {
  readonly variantId: string;
  readonly sku: string;
  /** Les codes que la propagation AJOUTERAIT à sa déclaration. */
  readonly toAdd: readonly string[];
  /**
   * Les codes qu'elle RETIRERAIT : déclarés, et qu'aucun autre ingrédient de
   * la composition ne porte encore. Une case par déclinaison, cochée par défaut.
   */
  readonly toRemove: readonly string[];
  /**
   * Parmi `toAdd`, les codes qu'elle déclarait en TRACE : ils quittent « peut
   * contenir » pour les allergènes — si l'ingrédient le contient, ce n'est plus
   * une trace.
   */
  readonly promotedFromTrace: readonly string[];
  /** Le retrait vide la liste : elle affirmera « aucun allergène ». À afficher. */
  readonly becomesNone: boolean;
  /**
   * Ce qu'elle ne recevra PAS, et pourquoi — `archived_allergen` : un code
   * archivé qu'elle ne portait pas. Elle est exclue pour ce code ; le reste
   * s'applique.
   */
  readonly blocked: readonly {
    readonly code: string;
    readonly reason: "archived_allergen" | "refused_by_declaration";
  }[];
  /**
   * Aucune déclaration : rien n'est proposé — on ne fabrique pas une
   * déclaration que personne n'a faite. « À déclarer dans la fiche ».
   */
  readonly undeclared: boolean;
}

/** Une fiche non archivée qui cite l'ingrédient. */
export interface ProductAllergenPropagationView {
  readonly productId: string;
  readonly name: string;
  readonly status: "draft" | "published";
  readonly variants: readonly VariantAllergenPropagationView[];
}

/**
 * Les comptes du message, en FICHES — une PARTITION de `productsTouched` :
 * chaque fiche dans une seule rubrique, par priorité à perdre > à recevoir >
 * bloquée > non renseignée > déjà conforme > gardée par un autre ingrédient. Les
 * `*Published` sont des sous-ensembles de leur rubrique.
 */
export interface IngredientAllergenPropagationCounts {
  /** Les fiches non archivées qui citent l'ingrédient. */
  readonly productsTouched: number;
  /** Au moins une déclinaison perdrait un code. */
  readonly toLose: number;
  readonly toLosePublished: number;
  /** Au moins une déclinaison recevrait un code. */
  readonly toReceive: number;
  readonly toReceivePublished: number;
  /** Son seul changement est refusé (code archivé) — pas « déjà conforme ». */
  readonly blocked: number;
  /** Au moins une déclinaison sans déclaration. */
  readonly undeclared: number;
  /** Rien à recevoir ni à perdre. */
  readonly alreadyDeclared: number;
  /** Le code retiré y reste déclaré : un autre ingrédient cité le porte. */
  readonly keptByOtherIngredient: number;
}

/** L'aperçu entier, calculé par le serveur. */
export interface IngredientAllergenPropagationView {
  readonly ingredientKey: string;
  readonly ingredientName: string;
  /** Les codes effectivement propagés : l'ingrédient les porte encore. */
  readonly added: readonly string[];
  /** Les codes effectivement retirés : l'ingrédient ne les porte plus. */
  readonly removed: readonly string[];
  readonly products: readonly ProductAllergenPropagationView[];
  readonly counts: IngredientAllergenPropagationCounts;
}
