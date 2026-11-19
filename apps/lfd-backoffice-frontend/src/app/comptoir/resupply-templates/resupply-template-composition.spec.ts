import { describe, expect, it } from 'vitest';

import { compositionOf, staleCount, templateLines } from './resupply-template-composition';
import { ARTICLES, baseMatin } from './resupply-template.testing';

describe('la composition d’un modèle', () => {
  it('met les lignes qui s’appliquent dans la table, et garde les autres à part', () => {
    const composition = compositionOf(baseMatin());
    expect([...composition.quantities]).toEqual([['CRO', 12]]);
    expect(composition.stale.map((line) => line.sku)).toEqual(['OLD', 'BAG']);
    expect(staleCount(baseMatin())).toBe(2);
  });

  it('enregistre la table à l’unité du catalogue, puis les lignes inapplicables gardées', () => {
    const { stale } = compositionOf(baseMatin());
    expect(templateLines(ARTICLES, new Map([['CRO', 12]]), stale)).toEqual([
      { sku: 'CRO', quantity: 12, saleUnit: 'piece' },
      { sku: 'OLD', quantity: 3, saleUnit: 'piece' },
      { sku: 'BAG', quantity: 500, saleUnit: 'weight' },
    ]);
  });

  it('un article ressaisi dans la table remplace sa ligne inapplicable : un SKU une fois', () => {
    const { stale } = compositionOf(baseMatin());
    const lines = templateLines(ARTICLES, new Map([['BAG', 4]]), stale);
    expect(lines.filter((line) => line.sku === 'BAG')).toEqual([
      { sku: 'BAG', quantity: 4, saleUnit: 'piece' },
    ]);
  });
});
