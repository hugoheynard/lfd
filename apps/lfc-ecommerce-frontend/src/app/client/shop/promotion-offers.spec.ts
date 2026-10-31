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
