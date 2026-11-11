import { describe, expect, it } from 'vitest';

import { discountFormOf } from '../general-discount-form';
import { discountFamiliesOf, discountLineRows, discountNames } from '../general-discount-lines';
import { ARTICLES, CATEGORIES, HUGO } from './general-discount-fixture';

/** **Les lignes du sélecteur de remise** : familles, parentes d'abord, et lignes rangées. */

describe('la lecture', () => {
  const names = discountNames(CATEGORIES);

  it('liste les sous-familles et leurs parentes, parentes d’abord', () => {
    expect(discountFamiliesOf(CATEGORIES).map((family) => family.id)).toEqual([
      'pain',
      'pain_spe',
      'choco',
    ]);
  });

  it('range une sous-famille sous sa famille et compte ce que chaque ligne décide', () => {
    const rows = discountLineRows(
      discountFormOf(HUGO)!,
      discountFamiliesOf(CATEGORIES),
      ARTICLES,
      names,
    );
    expect(rows.map((row) => [row.name, row.nested, row.subtitle])).toEqual([
      ['Pains', false, 'Famille · 1 article(s)'],
      ['Nom BAG (BAG)', true, 'Article de Pains (−40 %) · 1 article(s)'],
      ['Pains spéciaux', true, 'Sous-famille de Pains (−40 %) · 1 article(s)'],
      ['Chocolat', false, 'Famille · 1 article(s)'],
    ]);
  });
});
