import { formatEuro, formatRate } from './format-money';

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
