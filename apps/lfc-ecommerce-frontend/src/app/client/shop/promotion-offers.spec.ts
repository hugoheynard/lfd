import type { ShopItemFulfillmentOfferView } from '@lfd/contracts';

import { FR } from '../copy/fr';
import { fulfillmentOfferLabels } from './promotion-offers';

const TWENTY = { kind: 'percent', basisPoints: 2000 } as const;
const PLACES: Readonly<Record<string, string>> = { pk_adroit: "L'adroit" };
const placeOf = (id: string): string | null => PLACES[id] ?? null;

function labelsOf(fulfillment: ShopItemFulfillmentOfferView['fulfillment']): readonly string[] {
  return fulfillmentOfferLabels({ effect: TWENTY, fulfillment }, FR.product, placeOf);
}

describe('fulfillmentOfferLabels — ce que le rayon promet', () => {
  it('dit le retrait partout et la livraison partout', () => {
    const labels = labelsOf({ pickup: 'all', delivery: 'all' });
    expect(labels).toHaveLength(2);
    expect(labels[1]).toBe('−20 % en livraison');
  });

  it('nomme chaque point choisi, et tait un point inconnu', () => {
    const labels = labelsOf({ pickup: { points: ['pk_adroit', 'pk_inconnu'] }, delivery: 'none' });
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain("L'adroit");
  });

  /**
   * Régression : une promotion limitée à certaines zones se disait « en
   * livraison », promesse faite à toute adresse livrée (fix 2026-10-31).
   */
  it('ne promet pas la livraison pour une sélection de zones', () => {
    expect(labelsOf({ pickup: 'none', delivery: { zones: ['zone_centre'] } })).toEqual([]);
  });
});

describe('fulfillmentOfferLabels — une offre à jours et heures', () => {
  const FIFTY = { kind: 'percent', basisPoints: 5000 } as const;
  const hours = (activeNow: boolean, moment: 'ordered_at' | 'handover_at' = 'ordered_at') => ({
    moment,
    activeNow,
    windows: [{ weekdays: ['tue', 'thu'] as const, start: '17:00', end: '19:00' }],
  });
  const of = (offer: Pick<ShopItemFulfillmentOfferView, 'hours'>) =>
    fulfillmentOfferLabels(
      { effect: FIFTY, fulfillment: { pickup: 'all', delivery: 'none' }, ...offer },
      FR.product,
      placeOf,
    );

  it('hors des heures, se dit avec ses heures', () => {
    expect(of({ hours: hours(false) })).toEqual([
      '−50 % en retrait, mardi et jeudi de 17 h à 19 h',
    ]);
  });

  it('active maintenant, se dit comme aujourd’hui', () => {
    expect(of({ hours: hours(true) })).toEqual(['−50 % en retrait']);
  });

  it('jugée au créneau, dit le créneau ; tous les jours, les jours se taisent', () => {
    expect(
      of({
        hours: {
          moment: 'handover_at',
          activeNow: false,
          windows: [
            {
              weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
              start: '20:30',
              end: '24:00',
            },
          ],
        },
      }),
    ).toEqual(['−50 % en retrait, pour un créneau de 20:30 à minuit']);
  });
});
