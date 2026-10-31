import type { AudiencePickupAddressView, AudiencePickupDiscount } from '@lfd/contracts';

import { bestPickupDiscount, pickupAdjustmentFor, pickupOffer } from './pickup-discount';

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

function pointWith(discount: AudiencePickupDiscount | null): AudiencePickupAddressView {
  return {
    id: 'pick_labo',
    label: 'Le Labo',
    ligne1: 'Route de la Balme',
    ligne2: '',
    codePostal: '73150',
    ville: 'Val d’Isère',
    pays: 'France',
    discount,
    opening: { proPickup: null, publicOpening: null },
    gps: null,
  };
}

/**
 * Plan remise retrait par clientèle, lot C : « sur tout » ne se dit que d'une
 * remise qui couvre tout le catalogue — le panier démentirait l'étiquette.
 */
describe('pickupOffer — sur tout ou sur une sélection', () => {
  it('dit « sur tout » sans règle', () => {
    expect(pickupOffer(pointWith(TEN_PERCENT), false, COPY).label).toBe('−10 % sur tout');
  });

  it('dit « sur une sélection » dès qu’une règle exclut', () => {
    const point = pointWith({
      ...TEN_PERCENT,
      categories: [{ categoryId: 'cat_epicerie', eligible: false }],
    });
    expect(pickupOffer(point, false, COPY).label).toBe('−10 % sur une sélection');
  });

  it('dit « sur une sélection » en mode « seulement »', () => {
    const point = pointWith({ ...TEN_PERCENT, scope: 'only' });
    expect(pickupOffer(point, false, COPY).label).toBe('−10 % sur une sélection');
  });

  it('une règle qui réinclut seule ne retire rien : « sur tout »', () => {
    const point = pointWith({
      ...TEN_PERCENT,
      products: [{ productId: 'prd_tasse', eligible: true }],
    });
    expect(pickupOffer(point, false, COPY).label).toBe('−10 % sur tout');
  });

  it('sans remise, le tarif : « Prix pro » à qui la caisse sert en pro', () => {
    expect(pickupOffer(pointWith(null), true, COPY)).toEqual({
      label: 'Prix pro',
      hasOffer: false,
    });
  });

  it('sans remise, « Prix boutique » à un particulier', () => {
    expect(pickupOffer(pointWith(null), false, COPY)).toEqual({
      label: 'Prix boutique',
      hasOffer: false,
    });
  });
});

/**
 * Depuis le 2026-10-31, le serveur rend UNE remise par point, celle de qui
 * regarde : la boutique la lit telle quelle, sans clé de clientèle.
 */
describe('la remise unique du point', () => {
  it('pickupAdjustmentFor lit la remise servie, ou rien', () => {
    expect(pickupAdjustmentFor(pointWith(TEN_PERCENT))).toEqual({ mode: 'percent', bp: 1000 });
    expect(pickupAdjustmentFor(pointWith(null))).toBeNull();
  });

  it('bestPickupDiscount retient la meilleure des remises servies', () => {
    const twenty = { ...TEN_PERCENT, adjustment: { mode: 'percent', bp: 2000 } } as const;
    expect(
      bestPickupDiscount([pointWith(TEN_PERCENT), pointWith(twenty), pointWith(null)]),
    ).toEqual({ mode: 'percent', bp: 2000 });
    expect(bestPickupDiscount([pointWith(null)])).toBeNull();
  });
});
