import type { DeliverySuggestedPlacementView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { placeLabel, placementSuggestionWords } from './placement-suggestion-words';

const SUGGESTED: DeliverySuggestedPlacementView = {
  orderId: 'o_1',
  reference: 'CMD-1',
  status: 'suggested',
  roundId: 'r_1',
  roundVersion: 3,
  vehicleId: 'v_2',
  vehicleName: 'Camionnette 2',
  passage: 1,
  after: 4,
  stopCount: 7,
  extraMinutes: 6,
};

describe('placementSuggestionWords (CA7)', () => {
  it('dit le véhicule, le rang et le temps ajouté', () => {
    expect(placementSuggestionWords(SUGGESTED)).toBe(
      'Place suggérée : Camionnette 2, entre l’arrêt 4 et 5 (+6 min, échéance tenue)',
    );
  });

  it('nomme le passage au-delà du premier', () => {
    expect(placementSuggestionWords({ ...SUGGESTED, passage: 2 })).toContain(
      'Camionnette 2 (passage 2),',
    );
  });

  it('dit la raison quand aucune place n’est suggérée', () => {
    expect(
      placementSuggestionWords({
        orderId: 'o_1',
        reference: 'CMD-1',
        status: 'none',
        reason: 'capacity',
      }),
    ).toBe('Aucune place suggérée : aucune tournée n’a la place dans sa caisse.');
  });
});

describe('placeLabel', () => {
  it.each([
    [{ after: 0, stopCount: 0 }, 'seul arrêt'],
    [{ after: 0, stopCount: 3 }, 'en tête'],
    [{ after: 3, stopCount: 3 }, 'après l’arrêt 3'],
    [{ after: 1, stopCount: 3 }, 'entre l’arrêt 1 et 2'],
  ])('%o → %s', (place, label) => {
    expect(placeLabel(place)).toBe(label);
  });
});
