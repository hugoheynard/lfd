import { describe, expect, it } from 'vitest';

import {
  addRateLabel,
  RESULT_PERIOD_OPTIONS,
  resultPeriodOf,
  revenueLabel,
} from '../suggestion-results';

describe('les résultats d’une suggestion', () => {
  it('propose 7, 30 et 90 jours, et ne lit que ceux-là', () => {
    expect(RESULT_PERIOD_OPTIONS.map((one) => one.value)).toEqual(['7', '30', '90']);
    expect(resultPeriodOf('90')).toBe(90);
    expect(resultPeriodOf('14')).toBeNull();
  });

  it('dit le taux d’ajout en pour cent, et un tiret sans affichage', () => {
    expect(addRateLabel({ addRateBasisPoints: 1250 })).toBe('12,5 %');
    expect(addRateLabel({ addRateBasisPoints: 5000 })).toBe('50 %');
    expect(addRateLabel({ addRateBasisPoints: null })).toBe('—');
  });

  it('écrit le chiffre d’affaires en euros, depuis des centimes', () => {
    expect(revenueLabel({ revenueEstimateCents: 240 }).replace(/\s/gu, ' ')).toBe('2,40 €');
  });
});
