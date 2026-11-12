import type { VariantSnapshot } from "../entities/variant.js";

/** Ce qu'il faut d'une déclinaison pour dire quels allergènes elle porte. */
export type AllergenSheetHolder = Pick<
  VariantSnapshot,
  "regulatoryFollowsDefault" | "allergenSheet"
>;

/**
 * **Les allergènes qu'une déclinaison porte réellement** : ceux du défaut
 * quand elle s'y aligne, les siens sinon. Les traces voyagent avec les
 * allergènes — ce sont des allergènes.
 *
 * Une seule écriture de la règle, lue par l'agrégat (`Product.snapshot`) et
 * par les lecteurs allégés qui ne rechargent pas la fiche entière (la matrice
 * des allergènes) : deux écritures finiraient par donner deux réponses.
 */
export function alignedAllergenSheet(
  variant: AllergenSheetHolder,
  defaultVariant: AllergenSheetHolder,
): VariantSnapshot["allergenSheet"] {
  return variant.regulatoryFollowsDefault ? defaultVariant.allergenSheet : variant.allergenSheet;
}
