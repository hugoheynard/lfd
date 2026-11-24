import type { SiteResupplyDraftView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ARTICLES } from './resupply-stock.testing';
import { ALL_SHELVES } from '../resupply-shelves/resupply-shelves';
import { buildStockRows, filterStockRows, rowStateLabel } from './resupply-stock-rows';

function draft(target: 'asap' | 'tomorrow', lines: [string, number][]): SiteResupplyDraftView {
  return {
    id: `draft_${target}`,
    target,
    serviceDay: '2026-03-10',
    version: 1,
    name: null,
    arrivalBy: null,
    lines: lines.map(([sku, quantity]) => ({ sku, label: sku, quantity, saleUnit: 'piece' })),
  };
}

const EMPTY = {
  articles: ARTICLES,
  stock: [],
  unordered: [],
  alertLevels: new Map(),
  asapDraft: null,
  tomorrowDraft: null,
} as const;

describe('les lignes de la table du réassort', () => {
  it('met les alertes en tête, puis les demandés, puis le reste, dans l’ordre du catalogue', () => {
    const rows = buildStockRows({
      ...EMPTY,
      alertLevels: new Map([['PAC', 'low' as const]]),
      tomorrowDraft: draft('tomorrow', [['CRO', 4]]),
    });
    expect(rows.map((row) => row.sku)).toEqual(['PAC', 'CRO', 'BAG']);
    expect(rows.find((row) => row.sku === 'CRO')?.tomorrow).toBe(4);
  });

  it('garde un article reçu puis retiré du catalogue, sans famille', () => {
    const rows = buildStockRows({
      ...EMPTY,
      stock: [
        { sku: 'OLD', label: 'Ancien', receivedQuantity: 3, estimatedStock: 2, saleUnit: 'piece' },
      ],
    });
    expect(rows.at(-1)).toMatchObject({ sku: 'OLD', name: 'Ancien', categoryId: null, stock: 2 });
  });

  /** Des pièces et des grammes ne s'additionnent jamais (L2b-1). */
  it('ne lit pas un stock d’une autre unité que celle de l’article', () => {
    const rows = buildStockRows({
      ...EMPTY,
      stock: [
        {
          sku: 'CRO',
          label: 'Croissant',
          receivedQuantity: 500,
          estimatedStock: 500,
          saleUnit: 'weight',
        },
      ],
      unordered: [{ sku: 'CRO', label: 'Croissant', receivedQuantity: 2, saleUnit: 'piece' }],
    });
    expect(rows.find((row) => row.sku === 'CRO')).toMatchObject({ stock: 0, unordered: 2 });
  });

  it('filtre par rayon et par recherche sans accents ni casse, les deux combinés', () => {
    const rows = buildStockRows(EMPTY);
    expect(filterStockRows(rows, ' CHOCOLAT ', ALL_SHELVES).map((row) => row.sku)).toEqual(['PAC']);
    expect(filterStockRows(rows, '', 'fam_morning').map((row) => row.sku)).toEqual(['CRO', 'PAC']);
    expect(filterStockRows(rows, 'baguette', 'fam_morning')).toEqual([]);
  });

  it('un rayon parent montre son sous-arbre ; une ligne retirée du catalogue va sous « famille inconnue »', () => {
    const viennoiserie = { id: 'fam_v', name: 'Viennoiserie', position: 0 };
    const rows = buildStockRows({
      ...EMPTY,
      articles: [
        ...ARTICLES,
        {
          sku: 'BRI',
          name: 'Brioche',
          categoryId: 'fam_brio',
          categoryName: 'Brioches',
          family: { id: 'fam_brio', name: 'Brioches', position: 1, ancestors: [viennoiserie] },
          saleUnit: 'piece',
          internal: false,
        },
      ],
      stock: [
        { sku: 'OLD', label: 'Ancien', receivedQuantity: 2, estimatedStock: 2, saleUnit: 'piece' },
      ],
    });
    expect(filterStockRows(rows, '', 'fam_v').map((row) => row.sku)).toEqual(['BRI']);
    expect(filterStockRows(rows, '', 'unknown-family').map((row) => row.sku)).toEqual(['OLD']);
    expect(rows.find((row) => row.sku === 'OLD')?.family).toBeNull();
  });

  it('dit l’état en clair', () => {
    expect((['ok', 'low', 'out_of_stock'] as const).map(rowStateLabel)).toEqual([
      'OK',
      'Faible',
      'Rupture',
    ]);
  });
});
