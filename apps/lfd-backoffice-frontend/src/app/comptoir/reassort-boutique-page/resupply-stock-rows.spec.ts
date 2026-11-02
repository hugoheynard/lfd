import type { SiteResupplyDraftView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ARTICLES } from './resupply-stock.testing';
import {
  ALL_CATEGORIES,
  buildStockRows,
  categoryOptionsOf,
  filterStockRows,
  rowStateLabel,
} from './resupply-stock-rows';

function draft(target: 'asap' | 'tomorrow', lines: [string, number][]): SiteResupplyDraftView {
  return {
    id: `draft_${target}`,
    target,
    serviceDay: '2026-03-10',
    version: 1,
    name: null,
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

  it('filtre par famille et par recherche sans accents ni casse, les deux combinés', () => {
    const rows = buildStockRows(EMPTY);
    expect(filterStockRows(rows, ' CHOCOLAT ', ALL_CATEGORIES).map((row) => row.sku)).toEqual([
      'PAC',
    ]);
    expect(filterStockRows(rows, '', 'fam_morning').map((row) => row.sku)).toEqual(['CRO', 'PAC']);
    expect(filterStockRows(rows, 'baguette', 'fam_morning')).toEqual([]);
  });

  it('propose « Tout » puis une puce par famille, dans l’ordre du catalogue', () => {
    expect(categoryOptionsOf(ARTICLES).map((option) => option.label)).toEqual([
      'Tout',
      'Pains',
      'Viennoiseries',
    ]);
  });

  it('dit l’état en clair', () => {
    expect((['ok', 'low', 'out_of_stock'] as const).map(rowStateLabel)).toEqual([
      'OK',
      'Faible',
      'Rupture',
    ]);
  });
});
