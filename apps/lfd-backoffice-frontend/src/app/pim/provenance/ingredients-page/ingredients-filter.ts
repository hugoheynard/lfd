import type { IngredientView } from '@lfd/pim-contracts';

/** Les trois états d'allergènes d'une matière, et « tous » (2026-10-26). */
export type AllergenStateFilter = 'all' | 'unknown' | 'none' | 'some';

export const ALLERGEN_STATE_OPTIONS: readonly {
  readonly value: AllergenStateFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'Tous' },
  { value: 'unknown', label: 'Non renseigné' },
  { value: 'none', label: 'Aucun allergène' },
  { value: 'some', label: 'Avec allergènes' },
];

/** L'état d'une matière : codes, « aucun » déclaré, ou rien de dit. */
export function allergenStateOf(ingredient: IngredientView): Exclude<AllergenStateFilter, 'all'> {
  if (ingredient.allergens.length > 0) {
    return 'some';
  }
  return ingredient.declaresNoAllergen ? 'none' : 'unknown';
}

/** Le filtre par état, puis la recherche — les deux se combinent. */
export function visibleIngredients(
  ingredients: readonly IngredientView[],
  state: AllergenStateFilter,
  query: string,
): readonly IngredientView[] {
  const kept =
    state === 'all' ? ingredients : ingredients.filter((i) => allergenStateOf(i) === state);
  return filterIngredients(kept, query);
}

/**
 * Filtre de la liste des ingrédients, côté client : le référentiel tient en
 * une page, et la liste des fiches (`products-page`) cherche de la même façon
 * — sous-chaîne, insensible à la casse.
 *
 * Trois champs, ceux que l'écran montre : le nom, l'origine, l'appellation
 * (libellé et signe). Une requête vide rend la liste telle quelle.
 */
export function filterIngredients(
  ingredients: readonly IngredientView[],
  query: string,
): readonly IngredientView[] {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return ingredients;
  }
  return ingredients.filter((ingredient) =>
    searchableFields(ingredient).some((field) => field.toLowerCase().includes(q)),
  );
}

function searchableFields(ingredient: IngredientView): readonly string[] {
  const appellation = ingredient.appellation;
  return [
    ingredient.name.fr,
    ingredient.origin,
    appellation?.label.fr ?? '',
    appellation?.scheme ?? '',
  ];
}
