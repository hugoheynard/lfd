import { describe, expect, it } from 'vitest';

import {
  basisPointsOf,
  percentField,
  suggestedPenaltyRate,
} from '../invoice-payment-terms-wording';

describe('les mentions de la facture — taux en points de base', () => {
  it('lit un taux en pourcents, sur les chiffres, sans flottant', () => {
    expect(basisPointsOf('14,15')).toBe(1415);
    expect(basisPointsOf('14.15')).toBe(1415);
    expect(basisPointsOf(' 10 % ')).toBe(1000);
    expect(basisPointsOf('4,1')).toBe(410);
    expect(basisPointsOf('0,01')).toBe(1);
  });

  it('refuse ce qui n’est pas un taux au centième de point', () => {
    for (const raw of ['', 'abc', '14,155', '-1', '1 000']) {
      expect(basisPointsOf(raw)).toBeNull();
    }
  });

  it('réécrit un taux pour le champ, sans zéros inutiles', () => {
    expect(percentField(1415)).toBe('14,15');
    expect(percentField(1000)).toBe('10');
    expect(percentField(1410)).toBe('14,1');
    expect(percentField(1405)).toBe('14,05');
    expect(basisPointsOf(percentField(1405))).toBe(1405);
  });

  it('suggère le taux BCE + 10 points, et rien sans taux BCE', () => {
    expect(suggestedPenaltyRate(415)).toBe(1415);
    expect(suggestedPenaltyRate(null)).toBeNull();
  });
});
