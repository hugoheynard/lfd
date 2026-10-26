import type { AppellationView, IngredientView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import {
  allergenStateOf,
  filterIngredients,
  visibleIngredients,
} from '../ingredients-page/ingredients-filter';

const AOP: AppellationView = {
  code: 'aop-beaufort',
  label: { fr: 'Beaufort' },
  scheme: 'AOP',
  active: true,
  usedBy: 1,
};

function ingredient(
  key: string,
  name: string,
  origin: string,
  appellation: AppellationView | null = null,
): IngredientView {
  return {
    key,
    name: { fr: name },
    description: null,
    origin,
    appellation,
    allergens: [],
    declaresNoAllergen: false,
    usedBy: 0,
  };
}

const LIST: readonly IngredientView[] = [
  ingredient('beurre', 'Beurre de Savoie', 'Savoie, France'),
  ingredient('farine', 'Farine de sarrasin', 'Bretagne'),
  ingredient('fromage', 'Fromage', '', AOP),
];

const keys = (rows: readonly IngredientView[]): readonly string[] => rows.map((r) => r.key);

describe('filterIngredients', () => {
  it('rend toute la liste sur une requête vide ou blanche', () => {
    expect(filterIngredients(LIST, '')).toBe(LIST);
    expect(keys(filterIngredients(LIST, '   '))).toEqual(['beurre', 'farine', 'fromage']);
  });

  it('cherche dans le nom, sans tenir compte de la casse', () => {
    expect(keys(filterIngredients(LIST, 'SARRASIN'))).toEqual(['farine']);
  });

  it("cherche dans l'origine", () => {
    expect(keys(filterIngredients(LIST, 'bretagne'))).toEqual(['farine']);
  });

  it("cherche dans le libellé et le signe de l'appellation", () => {
    expect(keys(filterIngredients(LIST, 'beaufort'))).toEqual(['fromage']);
    expect(keys(filterIngredients(LIST, 'aop'))).toEqual(['fromage']);
  });

  it('rend une liste vide quand rien ne correspond', () => {
    expect(filterIngredients(LIST, 'chocolat')).toEqual([]);
  });
});

describe('visibleIngredients — état des allergènes (2026-10-26)', () => {
  const SOME = { ...ingredient('noix', 'Noix', 'Périgord'), allergens: ['SH'] };
  const NONE = { ...ingredient('eau', 'Eau de source', 'Savoie'), declaresNoAllergen: true };
  const UNKNOWN = ingredient('sel', 'Sel de Guérande', 'Bretagne');
  const ALL: readonly IngredientView[] = [SOME, NONE, UNKNOWN];

  it('range chaque matière dans un des trois états', () => {
    expect(ALL.map(allergenStateOf)).toEqual(['some', 'none', 'unknown']);
  });

  it('filtre par état', () => {
    expect(keys(visibleIngredients(ALL, 'all', ''))).toEqual(['noix', 'eau', 'sel']);
    expect(keys(visibleIngredients(ALL, 'unknown', ''))).toEqual(['sel']);
    expect(keys(visibleIngredients(ALL, 'none', ''))).toEqual(['eau']);
    expect(keys(visibleIngredients(ALL, 'some', ''))).toEqual(['noix']);
  });

  it('combine le filtre et la recherche', () => {
    expect(keys(visibleIngredients(ALL, 'unknown', 'savoie'))).toEqual([]);
    expect(keys(visibleIngredients(ALL, 'none', 'savoie'))).toEqual(['eau']);
  });
});
