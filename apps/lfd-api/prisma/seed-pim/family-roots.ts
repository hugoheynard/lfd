import { CATALOGUE } from "./catalogue.js";

const PARENT_OF: ReadonlyMap<string, string | null> = new Map(
  CATALOGUE.categories.map((category) => [category.name.fr, category.parentName]),
);

/**
 * **La famille de tête d'une famille du semis** — « Baguettes & flûtes » →
 * « Pains ».
 *
 * Les familles du semis s'imbriquent depuis le 2026-10-29 ; ce qui se décide
 * par grande famille (la fiche réglementaire inventée, le prix au kilo des
 * pains) se lit sur la tête, pour qu'une sous-famille de plus ne le perde pas.
 * Une famille inconnue est sa propre tête.
 */
export function rootFamilyOf(name: string): string {
  let current = name;
  const seen = new Set<string>();
  for (
    let parent = PARENT_OF.get(current);
    parent !== undefined && parent !== null;
    parent = PARENT_OF.get(current)
  ) {
    if (seen.has(parent)) {
      break;
    }
    seen.add(parent);
    current = parent;
  }
  return current;
}
