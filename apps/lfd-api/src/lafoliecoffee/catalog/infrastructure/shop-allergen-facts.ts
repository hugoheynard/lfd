import type { ShopAllergenFacts } from "../domain/shop-allergens.js";
import { allergenLabelsOf } from "./allergen-labels.js";
import { allergenTextsOf } from "./allergen-texts.js";

/** Les colonnes d'allergènes d'un article, brutes, telles que Prisma les rend. */
export interface AllergenColumns {
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly allergensPrecautionary: boolean;
  readonly allergenTexts: unknown;
}

/**
 * Ce que la vitrine tire des colonnes d'allergènes — relues par les mêmes
 * mappers que l'agrégat. Une mention illisible lève `incomplete` : la vitrine
 * se tait plutôt que de montrer une liste qu'elle ne sait pas entière.
 */
export function shopAllergenFactsOf(row: AllergenColumns): ShopAllergenFacts {
  const codes = Array.isArray(row.allergens)
    ? row.allergens.filter((code): code is string => typeof code === "string")
    : null;
  const labels = allergenLabelsOf(row.allergenLabels);
  return {
    codes,
    incomplete: codes !== null && (labels === null || labels.incomplete),
    precautionary: row.allergensPrecautionary,
    texts: allergenTextsOf(row.allergenTexts),
  };
}
