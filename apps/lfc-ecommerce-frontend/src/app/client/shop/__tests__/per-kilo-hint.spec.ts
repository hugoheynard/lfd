import { describe, expect, it } from 'vitest';

import type { ShopItemView } from '@lfd/contracts';

import { perKiloHintLabel } from '../shop-price-basis.service';
import { TEST_ITEMS } from '../shop-catalogue.fixture';

const PIECE: ShopItemView = {
  ...TEST_ITEMS[0]!,
  saleUnit: 'piece',
  proPricePerKgMillicents: 1_234_560,
  publicPricePerKgTtcCents: 1_590,
};

function hint(item: ShopItemView, ttc: boolean): string | null {
  return perKiloHintLabel(item, ttc, ttc ? 'TTC' : 'HT', '/ kg');
}

describe('perKiloHintLabel — le prix au kilo sous une pièce', () => {
  it('écrit le prix public TTC pour un particulier', () => {
    expect(hint(PIECE, true)).toMatch(/^15,90\s€ \/ kg TTC$/);
  });

  it('écrit le prix pro HT, arrondi au centime, pour un professionnel', () => {
    expect(hint(PIECE, false)).toMatch(/^12,35\s€ \/ kg HT$/);
  });

  it("ne montre jamais l'autre assiette en repli quand la sienne manque", () => {
    expect(hint({ ...PIECE, publicPricePerKgTtcCents: null }, true)).toBeNull();
    expect(hint({ ...PIECE, proPricePerKgMillicents: null }, false)).toBeNull();
  });

  it('se tait quand le champ est absent du fil', () => {
    const { proPricePerKgMillicents: _p, publicPricePerKgTtcCents: _q, ...bare } = PIECE;
    expect(hint(bare, true)).toBeNull();
    expect(hint(bare, false)).toBeNull();
  });

  it('se tait sur un article au poids : son prix EST déjà le prix au kilo', () => {
    expect(hint({ ...PIECE, saleUnit: 'weight' }, true)).toBeNull();
    expect(hint({ ...PIECE, saleUnit: 'weight' }, false)).toBeNull();
  });
});
