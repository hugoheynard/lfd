import { describe, expect, it } from 'vitest';

import {
  centsToEurosInput,
  costPerLiterLabel,
  parseEurosToCents,
  priceLabel,
} from './purchase-price';

describe('parseEurosToCents', () => {
  it.each([
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0', 0],
    ['1 234,56', 123456],
    ['1\u202f234,56', 123456],
    ['0,29', 29],
    ['  7 ', 700],
  ])('lit « %s » en %i centimes, sans flottant', (text, cents) => {
    expect(parseEurosToCents(text)).toEqual({ ok: true, cents });
  });

  it('un champ vide est un prix inconnu, jamais zéro', () => {
    expect(parseEurosToCents('   ')).toEqual({ ok: true, cents: null });
  });

  it.each([
    ['12,555', 'deux décimales'],
    ['-1', 'négatif'],
    ['abc', 'illisible'],
    ['12,', 'illisible'],
    ['1 23', 'illisible'],
  ])('refuse « %s »', (text, said) => {
    const reading = parseEurosToCents(text);
    expect(reading.ok).toBe(false);
    expect(reading.ok ? '' : reading.issue).toContain(said);
  });
});

describe('les libellés du prix', () => {
  it('remplit le champ d’une correction', () => {
    expect(centsToEurosInput(1250)).toBe('12,50');
    expect(centsToEurosInput(5)).toBe('0,05');
    expect(centsToEurosInput(null)).toBe('');
  });

  it('affiche en euros HT fr-FR, ou « prix inconnu »', () => {
    expect(priceLabel(1250000).replace(/\s/g, ' ')).toBe('12 500,00 € HT');
    expect(priceLabel(null)).toBe('prix inconnu');
    expect(costPerLiterLabel(42).replace(/\s/g, ' ')).toBe('0,42 €/L HT');
    expect(costPerLiterLabel(null)).toBe('inconnu');
  });
});
