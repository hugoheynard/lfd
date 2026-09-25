import type { CounterCustomerCard } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { matchesCounterSearch } from './counter-customer-search';

const CARD: CounterCustomerCard = {
  id: 'co_01',
  name: 'Boulangerie Périn SARL',
  tradeName: 'Chez Périn',
  reference: 'C-7K2P9Q',
  siret: '81234567800019',
};

describe('matchesCounterSearch', () => {
  it('trouve tout quand la recherche est vide', () => {
    expect(matchesCounterSearch(CARD, '  ')).toBe(true);
  });

  it.each([
    ['la raison sociale, sans accents', 'boulangerie perin'],
    ["l'enseigne", 'chez'],
    ['la référence', 'c-7k2'],
    ['le SIRET dicté par groupes', '812 345 678'],
    ["l'identifiant", 'co_01'],
  ])('trouve par %s', (_label, query) => {
    expect(matchesCounterSearch(CARD, query)).toBe(true);
  });

  it('ne trouve pas ce que la carte ne porte pas', () => {
    expect(matchesCounterSearch(CARD, 'dupont')).toBe(false);
  });
});
