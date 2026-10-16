import { describe, expect, it } from 'vitest';

import {
  observedGapLabel,
  proPriceMillicentsOf,
  proPricePayloadOf,
  proPriceSuggestionOf,
  proPriceTextOf,
  ratioLabelOf,
} from '../pro-price-entry';

describe('la saisie du prix pro HT', () => {
  it.each([
    ['27,30331', 2_730_331],
    ['27.30331', 2_730_331],
    ['10', 1_000_000],
    ['0,00001', 1],
    ['1.00001', 100_001],
  ])('lit « %s » en %i millicentimes, sans flottant', (text, millicents) => {
    expect(proPriceMillicentsOf(text)).toBe(millicents);
  });

  it.each(['', '1,234567', '-1', 'abc', '1,'])('ne fait pas un prix de « %s »', (text) => {
    expect(proPriceMillicentsOf(text)).toBeNull();
  });

  it('réécrit un montant enregistré sans zéros inutiles', () => {
    expect(proPriceTextOf(2_730_331)).toBe('27,30331');
    expect(proPriceTextOf(1_000_000)).toBe('10');
    expect(proPriceTextOf(1_050_000)).toBe('10,5');
    expect(proPriceTextOf(1)).toBe('0,00001');
    expect(proPriceTextOf(null)).toBe('');
  });

  it('fait l’aller-retour exact', () => {
    for (const millicents of [0, 1, 99_999, 2_730_331, 2_147_483_647]) {
      expect(proPriceMillicentsOf(proPriceTextOf(millicents))).toBe(millicents);
    }
  });

  it('efface sur une saisie vide', () => {
    expect(proPricePayloadOf('  ')).toBeNull();
    expect(proPricePayloadOf(' 3,5 ')).toBe('3,5');
  });
});

describe('l’écart constaté', () => {
  it('dit l’écart entre les deux TTC, au dixième de pourcent', () => {
    expect(observedGapLabel(1_200, 1_080)).toBe('−10 %');
    expect(observedGapLabel(1_000, 897)).toBe('−10,3 %');
    expect(observedGapLabel(1_000, 1_020)).toBe('+2 %');
    expect(observedGapLabel(1_000, 1_000)).toBe('aucun écart');
    expect(observedGapLabel(0, 10)).toBeNull();
  });
});

/** Lot S (S3) : le rapport suggère, par la porte — le même calcul que le pré-remplissage. */
describe('la suggestion de prix pro', () => {
  it('donne le HT du rapport au taux b2b, au millicentime', () => {
    // 10,00 € TTC × 90 % = 9,00 € TTC ÷ 1,055 = 8,53081 € HT.
    expect(proPriceSuggestionOf(1_000, 9_000, 5.5)).toEqual({
      kind: 'ready',
      htMillicents: 853_081,
      ratioLabel: '90 %',
    });
  });

  it('dit pourquoi sans taux b2b', () => {
    expect(proPriceSuggestionOf(1_000, 9_000, null)).toEqual({ kind: 'no_vat' });
  });

  it('ne suggère rien sans rapport posé ni sans prix public', () => {
    expect(proPriceSuggestionOf(1_000, null, 5.5)).toEqual({ kind: 'none' });
    expect(proPriceSuggestionOf(null, 9_000, 5.5)).toEqual({ kind: 'none' });
  });

  it('écrit le rapport à la française', () => {
    expect(ratioLabelOf(8_750)).toBe('87,5 %');
  });
});
