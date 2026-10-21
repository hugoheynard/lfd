import type {
  LiveStockAlertsView,
  ResupplyProductionDayView,
  SiteResupplyView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { resupplyPoints, resupplyProductionRows } from './resupply-production-rows';

const DAY = '2026-01-03';

function resupply(
  siteId: string,
  target: 'tomorrow' | 'asap',
  lines: readonly [string, string, number][],
  name: string | null = null,
): SiteResupplyView {
  return {
    id: `${siteId}-${target}`,
    siteId,
    serviceDay: DAY,
    target,
    origin: 'counter',
    name,
    status: 'placed',
    lines: lines.map(([sku, label, quantity]) => ({ sku, label, quantity })),
    placedAt: '2026-01-02T17:00:00.000Z',
    placedBy: null,
    cancelledAt: null,
    cancelledBy: null,
  };
}

const VIEW: ResupplyProductionDayView = {
  serviceDay: DAY,
  planStopped: false,
  sites: [
    {
      siteId: 'labo',
      siteLabel: 'Le Labo',
      resupplies: [
        resupply('labo', 'tomorrow', [['CRO', 'Croissant', 10]]),
        resupply('labo', 'asap', [['CRO', 'Croissant', 2]]),
      ],
    },
    {
      siteId: 'village',
      siteLabel: null,
      resupplies: [resupply('village', 'tomorrow', [['OLD', 'Article retiré', 3]])],
    },
  ],
  totals: [
    { sku: 'CRO', label: 'Croissant', quantity: 12 },
    { sku: 'OLD', label: 'Article retiré', quantity: 3 },
  ],
  articles: [
    { sku: 'BAG', name: 'Baguette', categoryId: 'fam_bread', categoryName: 'Pains' },
    { sku: 'CRO', name: 'Croissant', categoryId: 'fam_morning', categoryName: 'Viennoiseries' },
    {
      sku: 'PAC',
      name: 'Pain au chocolat',
      categoryId: 'fam_morning',
      categoryName: 'Viennoiseries',
    },
  ],
};

const ALERTS: LiveStockAlertsView = {
  sites: [
    {
      siteId: 'gare',
      siteLabel: 'La Gare',
      alerts: [
        {
          id: 'a1',
          siteId: 'gare',
          sku: 'PAC',
          label: 'Pain au chocolat',
          level: 'out_of_stock',
          declaredAt: '2026-01-02T15:00:00.000Z',
          declaredBy: null,
        },
      ],
    },
  ],
};

describe('la table des réassorts de Prod manager (R3d)', () => {
  it('une colonne par point qui demande, puis par point qui alerte ; un point sans nom le dit', () => {
    expect(resupplyPoints(VIEW, ALERTS)).toEqual([
      { siteId: 'labo', label: 'Le Labo', names: [] },
      { siteId: 'village', label: 'Point inconnu', names: [] },
      { siteId: 'gare', label: 'La Gare', names: [] },
    ]);
  });

  it('un point porte les noms de ses réassorts nommés, distincts (R1g)', () => {
    const named: ResupplyProductionDayView = {
      ...VIEW,
      sites: [
        {
          siteId: 'labo',
          siteLabel: 'Le Labo',
          resupplies: [
            resupply('labo', 'tomorrow', [['CRO', 'Croissant', 10]], 'Vitrine du matin'),
            resupply('labo', 'asap', [['CRO', 'Croissant', 2]], 'Goûter'),
            resupply('labo', 'asap', [['CRO', 'Croissant', 1]]),
            resupply('labo', 'asap', [['CRO', 'Croissant', 1]], 'Goûter'),
          ],
        },
      ],
    };
    expect(resupplyPoints(named, null)).toEqual([
      { siteId: 'labo', label: 'Le Labo', names: ['Vitrine du matin', 'Goûter'] },
    ]);
  });

  it('une ligne par produit du catalogue, et un article demandé hors catalogue', () => {
    const points = resupplyPoints(VIEW, null);
    const rows = resupplyProductionRows(VIEW, points, null);
    expect(rows.map((row) => row.sku).sort()).toEqual(['BAG', 'CRO', 'OLD', 'PAC']);
    expect(rows.find((row) => row.sku === 'OLD')?.categoryId).toBeNull();
  });

  it('sépare « pour demain » et « au plus tôt » par point, et totalise le produit', () => {
    const points = resupplyPoints(VIEW, null);
    const croissant = resupplyProductionRows(VIEW, points, null).find((row) => row.sku === 'CRO');
    expect(croissant?.cells).toEqual([
      { tomorrow: 10, asap: 2, alert: null },
      { tomorrow: 0, asap: 0, alert: null },
    ]);
    expect(croissant?.total).toBe(12);
  });

  it('trie les alertes en tête, puis les demandés, puis le reste par nom', () => {
    const points = resupplyPoints(VIEW, ALERTS);
    const rows = resupplyProductionRows(VIEW, points, ALERTS);
    expect(rows.map((row) => row.sku)).toEqual(['PAC', 'OLD', 'CRO', 'BAG']);
    expect(rows[0]?.alert).toBe('out_of_stock');
    expect(rows[0]?.cells[2]?.alert).toBe('out_of_stock');
  });
});
