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

describe('pickupOffer — une société en attente', () => {
  const PENDING_ONLY: PickupAddressView = {
    ...pointWith(TEN_PERCENT),
    discounts: { b2b: null, b2c: TEN_PERCENT, b2bPending: null },
  };

  /**
   * Régression : la remise des particuliers était annoncée à une société en
   * attente, que la caisse sert en pro et à qui elle ne la retire pas (2026-10-31).
   */
  it('ne lui annonce pas la remise des particuliers ; elle lit le tarif pro', () => {
    expect(pickupOffer(PENDING_ONLY, 'b2bPending', COPY)).toEqual({
      label: 'Prix pro',
      hasOffer: false,
    });
  });

  it('lui annonce sa propre remise', () => {
    const point = {
      ...PENDING_ONLY,
      discounts: { ...PENDING_ONLY.discounts, b2bPending: TEN_PERCENT },
    };
    expect(pickupOffer(point, 'b2bPending', COPY).label).toBe('−10 % sur tout');
  });
});
