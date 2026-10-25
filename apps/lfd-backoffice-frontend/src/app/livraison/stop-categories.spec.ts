import { describe, expect, it } from 'vitest';

import { deliveryStopCategories } from './stop-categories';

describe('deliveryStopCategories — la couleur de chaque arrêt de livraison (L1b)', () => {
  it('la couleur de livraison du départ pour la clientèle ; inconnue : neutre', () => {
    const categories = deliveryStopCategories(
      [{ stopId: 's1', clientele: 'pro' }, { stopId: 's2' }],
      [
        {
          id: 'fournil',
          label: 'Fournil',
          supply: 'on_site',
          isDeparture: true,
          pickupColorB2b: null,
          pickupColorB2c: null,
          deliveryColorB2b: '#1e88e5',
          deliveryColorB2c: null,
          resupplyColor: null,
          transferColor: null,
        },
      ],
    );

    expect(categories.get('s1')).toEqual({
      key: 'delivery:pro',
      label: 'Livraison pro',
      color: '#1e88e5',
    });
    expect(categories.get('s2')?.color).toBeNull();
  });
});
