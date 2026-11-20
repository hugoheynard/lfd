import type { CatalogItemView, CustomerShelfPriceView } from '@lfd/contracts';

import { particularShelfOf } from './particular-shelf';

function item(sku: string): CatalogItemView {
  return {
    sku,
    name: sku,
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    family: null,
    category: null,
  };
}

function price(
  sku: string,
  lockedReason: CustomerShelfPriceView['lockedReason'] = null,
): CustomerShelfPriceView {
  return {
    sku,
    unitPriceMillicents: 100_000,
    struckFromMillicents: null,
    unitPriceTtcCents: 106,
    struckFromTtcCents: null,
    lockedReason,
  };
}

describe('particularShelfOf — la liste d’un particulier au comptoir', () => {
  it('ne garde que les articles de son rayon, dans l’ordre du catalogue', () => {
    const shown = particularShelfOf([item('A'), item('PRO'), item('B')], {
      audience: 'public',
      items: [price('B'), price('A')],
    });

    expect(shown.map((row) => row.sku)).toEqual(['A', 'B']);
  });

  it('écarte un article verrouillé : il ne se commande pas pour lui', () => {
    const shown = particularShelfOf([item('A'), item('L')], {
      audience: 'public',
      items: [price('A'), price('L', 'reserved_to_other_account')],
    });

    expect(shown.map((row) => row.sku)).toEqual(['A']);
  });

  it('un rayon vide ne montre rien — jamais le catalogue entier', () => {
    expect(particularShelfOf([item('A')], { audience: 'public', items: [] })).toEqual([]);
  });
});
