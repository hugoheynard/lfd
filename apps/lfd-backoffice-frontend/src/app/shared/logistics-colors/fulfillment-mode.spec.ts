import type { SitePaletteEntryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { fulfillmentModeOf } from './fulfillment-mode';

const NO_COLORS = {
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  resupplyColor: null,
  transferColor: null,
} as const;

const PALETTE: readonly SitePaletteEntryView[] = [
  {
    id: 'fournil',
    label: 'Fournil',
    supply: 'on_site',
    isDeparture: true,
    ...NO_COLORS,
    deliveryColorB2b: '#1e88e5',
  },
  {
    id: 'adroit',
    label: 'Adroit',
    supply: 'on_site',
    isDeparture: false,
    ...NO_COLORS,
    pickupColorB2c: '#fb8c00',
  },
];

describe('fulfillmentModeOf — « Livraison » ou « Retrait <site> », à la couleur du site', () => {
  it('une livraison se dit « Livraison », à la couleur de livraison du départ', () => {
    expect(
      fulfillmentModeOf(
        { fulfillmentMethod: 'delivery', clientele: 'pro', pickupLabel: null },
        PALETTE,
      ),
    ).toEqual({ key: 'delivery:pro', label: 'Livraison', color: '#1e88e5' });
  });

  it('un retrait dit le nom du site de la palette, à la couleur de son site', () => {
    expect(
      fulfillmentModeOf(
        {
          fulfillmentMethod: 'pickup',
          clientele: 'public',
          siteId: 'adroit',
          pickupLabel: 'Ancien nom',
        },
        PALETTE,
      ),
    ).toMatchObject({ label: 'Retrait Adroit', color: '#fb8c00' });
  });

  it('🔴 sans site connu : le point figé, en neutre — jamais une couleur inventée', () => {
    expect(
      fulfillmentModeOf(
        { fulfillmentMethod: 'pickup', clientele: 'pro', siteId: null, pickupLabel: 'Boutique' },
        PALETTE,
      ),
    ).toMatchObject({ label: 'Retrait Boutique', color: null });
    expect(fulfillmentModeOf({ fulfillmentMethod: 'pickup', pickupLabel: null }, [])).toMatchObject(
      { label: 'Retrait', color: null },
    );
  });
});
