import type { AudiencePickupDiscount, PickupAddressView } from '@lfd/contracts';

import { pickupOffer } from './pickup-discount';

const COPY = {
  discountTag: '−{value} sur tout',
  discountTagSelection: '−{value} sur une sélection',
  proPrice: 'Prix pro',
  shopPrice: 'Prix boutique',
};

const TEN_PERCENT: AudiencePickupDiscount = {
  adjustment: { mode: 'percent', bp: 1000 },
  scope: 'all_except',
  categories: [],
  products: [],
};

function pointWith(b2c: AudiencePickupDiscount | null): PickupAddressView {
  return {
    id: 'pick_labo',
    label: 'Le Labo',
    ligne1: 'Route de la Balme',
    ligne2: '',
    codePostal: '73150',
    ville: 'Val d’Isère',
    pays: 'France',
    discounts: { b2b: null, b2c },
    opening: { proPickup: null, publicOpening: null },
  };
}

/**
 * Plan remise retrait par clientèle, lot C : « sur tout » ne se dit que d'une
 * remise qui couvre tout le catalogue — le panier démentirait l'étiquette.
 */
describe('pickupOffer — sur tout ou sur une sélection', () => {
  it('dit « sur tout » sans règle', () => {
    expect(pickupOffer(pointWith(TEN_PERCENT), 'b2c', COPY).label).toBe('−10 % sur tout');
  });

  it('dit « sur une sélection » dès qu’une règle exclut', () => {
    const point = pointWith({
      ...TEN_PERCENT,
      categories: [{ categoryId: 'cat_epicerie', eligible: false }],
    });
    expect(pickupOffer(point, 'b2c', COPY).label).toBe('−10 % sur une sélection');
  });

  it('dit « sur une sélection » en mode « seulement »', () => {
    const point = pointWith({ ...TEN_PERCENT, scope: 'only' });
    expect(pickupOffer(point, 'b2c', COPY).label).toBe('−10 % sur une sélection');
  });

  it('une règle qui réinclut seule ne retire rien : « sur tout »', () => {
    const point = pointWith({
      ...TEN_PERCENT,
      products: [{ productId: 'prd_tasse', eligible: true }],
    });
    expect(pickupOffer(point, 'b2c', COPY).label).toBe('−10 % sur tout');
  });

  it('sans remise pour la clientèle, le tarif', () => {
    expect(pickupOffer(pointWith(TEN_PERCENT), 'b2b', COPY)).toEqual({
      label: 'Prix pro',
      hasOffer: false,
    });
  });
});
