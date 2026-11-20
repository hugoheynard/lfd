import type { ShopItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { FR } from '../copy/fr';
import { LOCKED_ITEM, TEST_ITEMS } from './shop-catalogue.fixture';
import { lockedReason } from './locked-item';

describe('lockedReason', () => {
  it('ne dit rien d’un article commandable', () => {
    expect(lockedReason(TEST_ITEMS[0] as ShopItemView, FR)).toBeNull();
  });

  it('dit « réservé à un autre compte » pour une réservation', () => {
    expect(lockedReason(LOCKED_ITEM, FR)?.short).toBe('Réservé à un autre compte');
  });

  it('dit « hors de la carte de votre site » pour un article hors carte (§ 3.4)', () => {
    expect(lockedReason({ ...LOCKED_ITEM, lockedReason: 'off_menu' }, FR)).toEqual({
      short: 'Hors de la carte de votre site',
      sentence: FR.shop.offMenuHint,
    });
  });
});
