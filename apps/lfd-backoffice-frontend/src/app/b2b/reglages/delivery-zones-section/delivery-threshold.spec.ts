import { describe, expect, it } from 'vitest';

import {
  formatThreshold,
  INVALID_THRESHOLD,
  thresholdCents,
  thresholdEuros,
} from './delivery-threshold';

describe('le seuil de livraison offerte', () => {
  it('vide reste vide : null, jamais 0', () => {
    expect(thresholdCents(null)).toBeNull();
    expect(thresholdEuros(null)).toBeNull();
  });

  it('les euros deviennent des centimes entiers', () => {
    expect(thresholdCents(80)).toBe(8_000);
    expect(thresholdCents(0.29)).toBe(29);
    expect(thresholdCents(0)).toBe(0);
  });

  it('refuse un négatif ou un montant plus fin que le centime', () => {
    expect(thresholdCents(-1)).toBe(INVALID_THRESHOLD);
    expect(thresholdCents(10.005)).toBe(INVALID_THRESHOLD);
  });

  it('se lit « dès 80,00 € HT »', () => {
    expect(formatThreshold(8_000).replace(/\s/gu, ' ')).toBe('dès 80,00 € HT');
  });
});
