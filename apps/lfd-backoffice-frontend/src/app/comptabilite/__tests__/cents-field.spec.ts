import { describe, expect, it } from 'vitest';

import { centsField, centsOf } from '../cents-field';

describe('centsOf — euros saisis → centimes entiers', () => {
  it.each([
    ['125', 12_500],
    ['125,5', 12_550],
    ['125,50', 12_550],
    ['0,01', 1],
    // Le cas qui trahit un flottant : 19.99 * 100 = 1998.9999999999998.
    ['19,99', 1_999],
    ['1.10', 110],
    [' 42 ', 4_200],
  ])('« %s » vaut %i centimes', (raw, cents) => {
    expect(centsOf(raw)).toBe(cents);
    expect(Number.isInteger(centsOf(raw))).toBe(true);
  });

  it.each(['', ',', 'abc', '-5', '0', '0,00', '12,345', '1,001'])(
    '« %s » est refusé, jamais arrondi',
    (raw) => {
      expect(centsOf(raw)).toBeNull();
    },
  );
});

describe('centsField — centimes → champ en euros', () => {
  it('pose deux décimales', () => {
    expect(centsField(12_550)).toBe('125,50');
    expect(centsField(100_000)).toBe('1000,00');
  });

  it('fait l’aller-retour avec centsOf', () => {
    expect(centsOf(centsField(1_999))).toBe(1_999);
  });
});
