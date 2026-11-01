import { lineTotalCents, pieces } from '@lfd/money';

import { formatCents, formatEuro, formatMillicents, formatRate } from './format-money';

describe('formatEuro', () => {
  it('écrit la virgule décimale et garde les deux décimales', () => {
    expect(formatEuro(5.5)).toBe('5,50 €');
    expect(formatEuro(16.375)).toBe('16,38 €');
  });
});

describe('formatRate', () => {
  it('ne colle pas de décimale à un taux entier', () => {
    expect(formatRate(5.5)).toBe('5,5 %');
    expect(formatRate(10)).toBe('10 %');
  });
});

/** Le prix HT exact d'un pro (plan `plan-remise-par-ligne.md`, § 18.6, option (b)). */
describe('formatMillicents', () => {
  it('écrit 0,8184 € et 5 pièces font la ligne de 4,09 € : la multiplication tombe juste', () => {
    expect(formatMillicents(81_840)).toBe('0,8184 €');
    // 5 × 0,8184 = 4,092 → 4,09 € : ce que le client refait à la calculatrice.
    expect(formatCents(lineTotalCents(81_840, pieces(5)))).toBe('4,09 €');
  });

  it('un prix au centime reste à deux décimales', () => {
    expect(formatMillicents(93_000)).toBe('0,93 €');
    expect(formatMillicents(140_000)).toBe('1,40 €');
  });

  it('cinq décimales au plus, zéros de queue retirés', () => {
    expect(formatMillicents(123_456)).toBe('1,23456 €');
    expect(formatMillicents(81_800)).toBe('0,818 €');
    expect(formatMillicents(5)).toBe('0,00005 €');
  });
});
