import type { PriceFloorView, PricingBoardView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { limitCoverage, matchesFilter, type ArticleLimitRow } from '../limit-coverage';

/**
 * **Les deux niveaux de couverture** : aucune limite (alerte), la seule limite
 * du catalogue (avertissement). Une limite de famille ou propre couvre.
 */

function floor(type: 'global' | 'category' | 'product', id: string | null): PriceFloorView {
  return {
    id: `${type}:${id ?? ''}`,
    scope: { type, id },
    mode: 'percent',
    value: 5000,
    dynamic: null,
    drift: null,
    createdBy: 'staff',
    createdByName: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

const item = (sku: string) => ({ sku, name: sku, canonicalMillicents: 200_000 });

// Seuls les champs que la couverture lit : le reste du tableau ne la regarde pas.
const BOARD: Pick<PricingBoardView, 'categories'> = {
  categories: [
    { id: 'vie', name: 'Viennoiseries', items: [item('VIE-1'), item('VIE-2')] },
    { id: 'pain', name: 'Pains', items: [item('PAI-1')] },
  ].map((category, position) => ({
    ...category,
    family: { id: category.id, name: category.name, position },
    vatRatePercent: 5.5,
    floor: null,
    rules: [],
    overlaps: [],
    ladders: [],
    items: category.items.map((entry) => ({
      ...entry,
      ownFloor: null,
      effectiveFloor: null,
      rules: [],
      supersededRuleIds: [],
      sealedByRuleId: null,
      sealedRuleIds: [],
      steps: [],
      floored: false,
      clampedToZero: false,
      finalMillicents: entry.canonicalMillicents,
      volumeTiers: [],
      elasticity: null,
      negotiationRoom: null,
    })),
  })),
};

function articles(floors: readonly PriceFloorView[]): Record<string, ArticleLimitRow> {
  const rows = limitCoverage(BOARD, floors).shelves.flatMap((shelf) => shelf.articles);
  return Object.fromEntries(rows.map((row) => [row.sku, row]));
}

describe('limitCoverage', () => {
  it('signale « sans limite » quand rien ne s’applique', () => {
    expect(articles([])['VIE-1']?.coverage).toBe('none');
  });

  it('signale « catalogue seulement » quand seule la limite globale protège', () => {
    const row = articles([floor('global', null)])['VIE-1'];

    expect(row?.coverage).toBe('global-only');
    expect(row?.source).toBe('global');
  });

  it('tient pour couvert un article dont la famille a sa limite', () => {
    const rows = articles([floor('global', null), floor('category', 'vie')]);

    expect(rows['VIE-1']?.coverage).toBe('covered');
    expect(rows['VIE-1']?.source).toBe('category');
    expect(rows['PAI-1']?.coverage).toBe('global-only');
  });

  it('préfère la limite propre à celle de la famille', () => {
    const own = floor('product', 'VIE-2');
    const row = articles([floor('category', 'vie'), own])['VIE-2'];

    expect(row?.source).toBe('own');
    expect(row?.applied).toBe(own);
  });

  it('filtre « Sans limite » et « À couvrir »', () => {
    const rows = Object.values(articles([floor('category', 'pain')]));
    const none = rows.filter((row) => matchesFilter(row, 'none')).map((row) => row.sku);

    expect(none).toEqual(['VIE-1', 'VIE-2']);
    const withGlobal = Object.values(articles([floor('global', null), floor('category', 'pain')]));
    expect(withGlobal.filter((row) => matchesFilter(row, 'none'))).toEqual([]);
    expect(
      withGlobal.filter((row) => matchesFilter(row, 'to-cover')).map((row) => row.sku),
    ).toEqual(['VIE-1', 'VIE-2']);
  });
});
