import { describe, expect, it } from 'vitest';

import {
  allStopsReady,
  declaredBinsLabelOf,
  expectedBinsLabelOf,
  packingBadgeOf,
  readyStopsLabel,
  sheetSummaryOf,
} from './my-round-packing';
import { mySheetLineOf } from './my-round.fixture';

describe('l’avancement du colisage, dit au livreur', () => {
  it('nomme l’avancement', () => {
    expect(packingBadgeOf('ready')).toEqual({ label: 'Prête', variant: 'success' });
    expect(packingBadgeOf('in_progress')).toEqual({ label: 'En préparation', variant: 'warning' });
  });

  it('compte les arrêts prêts, au singulier comme au pluriel', () => {
    expect(readyStopsLabel({ readyStops: 4, stopCount: 6 })).toBe('4 arrêts prêts sur 6');
    expect(readyStopsLabel({ readyStops: 1, stopCount: 3 })).toBe('1 arrêt prêt sur 3');
    expect(readyStopsLabel({ readyStops: 0, stopCount: 2 })).toBe('0 arrêts prêts sur 2');
  });

  it('« tout est prêt » demande au moins un arrêt', () => {
    expect(allStopsReady({ readyStops: 2, stopCount: 2 })).toBe(true);
    expect(allStopsReady({ readyStops: 1, stopCount: 2 })).toBe(false);
    expect(allStopsReady({ readyStops: 0, stopCount: 0 })).toBe(false);
  });

  it('dit les bacs déclarés, et le froid parmi eux', () => {
    expect(declaredBinsLabelOf({ binsDeclared: 0, coldBins: 0 })).toBe('aucun bac déclaré');
    expect(declaredBinsLabelOf({ binsDeclared: 1, coldBins: 0 })).toBe('1 bac déclaré');
    expect(declaredBinsLabelOf({ binsDeclared: 3, coldBins: 1 })).toBe(
      '3 bacs déclarés, dont 1 froid',
    );
  });

  it('l’attendu est une estimation — et rien quand la proposition ne sait pas', () => {
    expect(expectedBinsLabelOf({ binsExpected: 3 })).toBe('environ 3 attendus');
    expect(expectedBinsLabelOf({ binsExpected: 1 })).toBe('environ 1 attendu');
    expect(expectedBinsLabelOf({})).toBeNull();
  });

  it('résume la fiche', () => {
    expect(sheetSummaryOf([mySheetLineOf()])).toBe('Fiche · 1 produit');
    expect(sheetSummaryOf([mySheetLineOf(), mySheetLineOf({ sku: 'B' })])).toBe(
      'Fiche · 2 produits',
    );
  });
});
