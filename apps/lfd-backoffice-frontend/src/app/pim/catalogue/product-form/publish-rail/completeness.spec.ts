import { describe, expect, it } from 'vitest';
import { LOCALES } from '@lfd/pim-contracts';

import { completenessOf, measure, type CompletenessFacts } from './completeness';

/**
 * La règle, sans écran : ce qu'une fiche doit porter pour être publiable.
 *
 * Elle se teste sur un objet littéral parce qu'elle N'EST PAS un composant —
 * un `TestBed` ici ne prouverait rien de plus et cacherait la règle derrière un
 * gabarit.
 */
const EMPTY: CompletenessFacts = {
  name: null,
  categoryId: '',
  priceSet: false,
  allergensDeclared: false,
  description: null,
  mediaCount: 0,
};

/** Une fiche à laquelle il ne manque rien. */
const FULL: CompletenessFacts = {
  name: { fr: 'Baguette', en: 'Baguette', it: 'Baguette' },
  categoryId: 'cat_1',
  priceSet: true,
  allergensDeclared: true,
  description: { fr: 'Tradition', en: 'Tradition', it: 'Tradizione' },
  mediaCount: 1,
};

function check(facts: CompletenessFacts, key: string) {
  const found = completenessOf(facts).find((entry) => entry.key === key);
  if (found === undefined) {
    throw new Error(`Exigence « ${key} » absente.`);
  }
  return found;
}

describe('completenessOf — ce qui bloque la publication', () => {
  it('connaît son dénominateur AVANT la première frappe', () => {
    // Le compte ne bouge pas quand on remplit : deux champs traduisibles, une
    // langue chacun par locale, plus quatre exigences simples.
    const expected = 2 * LOCALES.length + 4;

    expect(measure(completenessOf(EMPTY))).toEqual({ done: 0, total: expected });
    expect(measure(completenessOf(FULL))).toEqual({ done: expected, total: expected });
  });

  it('éclate un texte traduisible en une condition par langue du catalogue', () => {
    expect(check(EMPTY, 'nom').children).toHaveLength(LOCALES.length);
  });

  it('refuse une exigence traduite à moitié', () => {
    const half = { ...FULL, name: { fr: 'Baguette', en: 'Baguette' } };

    expect(check(half, 'nom').done).toBe(false);
    expect(check(FULL, 'nom').done).toBe(true);
  });

  it('sépare le nom de la famille — elles ne se remplissent pas de la même façon', () => {
    const named = { ...EMPTY, name: FULL.name };

    expect(check(named, 'nom').done).toBe(true);
    expect(check(named, 'famille').done).toBe(false);
  });

  it('compte les FEUILLES : une langue vaut une exigence simple', () => {
    // Une langue manquante et un prix manquant coûtent le même point. C'est ce
    // qui fait que la barre mesure du travail et pas des rubriques.
    const noPrice = { ...FULL, priceSet: false };
    const noItalian = { ...FULL, name: { fr: 'Baguette', en: 'Baguette' } };

    expect(measure(completenessOf(noPrice)).done).toBe(measure(completenessOf(noItalian)).done);
  });

  it('ne mesure que du blanc ou du noir — plus rien de facultatif', () => {
    const leaves = completenessOf(EMPTY).flatMap((entry) => entry.children);

    expect(leaves.every((entry) => entry.done === false)).toBe(true);
  });
});
