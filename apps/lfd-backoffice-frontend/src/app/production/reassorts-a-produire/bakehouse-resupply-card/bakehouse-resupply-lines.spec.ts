import type { ResupplyArticleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { requestedAmountLabel, requestedLines, withQuantity } from './bakehouse-resupply-lines';

const ARTICLES: readonly ResupplyArticleView[] = [
  {
    sku: 'CRO',
    name: 'Croissant',
    categoryId: 'm',
    categoryName: 'Viennoiseries',
    saleUnit: 'piece',
  },
  { sku: 'GRA', name: 'Gravlax', categoryId: 't', categoryName: 'Traiteur', saleUnit: 'weight' },
  { sku: 'BAG', name: 'Baguette', categoryId: 'b', categoryName: 'Pains', saleUnit: 'piece' },
];

describe('les lignes d’un réassort du fournil', () => {
  it('ne garde que les quantités positives, dans l’ordre du catalogue', () => {
    const quantities = new Map([
      ['BAG', 3],
      ['CRO', 12],
      ['GRA', 0],
    ]);
    expect(requestedLines(ARTICLES, quantities)).toEqual([
      { sku: 'CRO', quantity: 12 },
      { sku: 'BAG', quantity: 3 },
    ]);
  });

  it('dit les pièces et le poids à part', () => {
    const label = requestedAmountLabel(ARTICLES, [
      { sku: 'CRO', quantity: 12 },
      { sku: 'GRA', quantity: 1250 },
    ]);
    expect(label).toContain('12');
    expect(label).toContain('1,25 kg');
  });

  it('retire l’article vidé ou mis à zéro, sans toucher la carte d’origine', () => {
    const before = new Map([['CRO', 4]]);
    expect(withQuantity(before, 'CRO', 0).has('CRO')).toBe(false);
    expect(withQuantity(before, 'CRO', null).has('CRO')).toBe(false);
    expect(withQuantity(before, 'BAG', 2).get('BAG')).toBe(2);
    expect(before.get('CRO')).toBe(4);
  });
});
