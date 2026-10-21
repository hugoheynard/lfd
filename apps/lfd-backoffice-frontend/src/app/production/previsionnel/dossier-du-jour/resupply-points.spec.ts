import { describe, expect, it } from 'vitest';

import { resupplyPiecesOf, resupplyPointsOf } from './resupply-points';

describe('resupplyPointsOf', () => {
  it('un bloc par point, par nom, fusionné par produit, le plus gros d’abord', () => {
    const points = resupplyPointsOf([
      {
        resupplyId: 'r-1',
        siteId: 'site-v',
        siteLabel: 'Village',
        servedByTransfer: true,
        lines: [
          { sku: 'CRO', productName: 'Croissant', quantity: 6 },
          { sku: 'PAC', productName: 'Pain au chocolat', quantity: 10 },
        ],
      },
      {
        resupplyId: 'r-2',
        siteId: 'site-v',
        siteLabel: 'Village',
        servedByTransfer: true,
        lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 6 }],
      },
      {
        resupplyId: 'r-3',
        siteId: 'site-l',
        siteLabel: 'Labo',
        servedByTransfer: false,
        lines: [{ sku: 'SEI', productName: 'Pain de seigle', quantity: 3 }],
      },
    ]);
    expect(points.map((point) => [point.label, point.quantity])).toEqual([
      ['Labo', 3],
      ['Village', 22],
    ]);
    expect(points[1]?.lines.map((line) => [line.productName, line.quantity])).toEqual([
      ['Croissant', 12],
      ['Pain au chocolat', 10],
    ]);
    expect(resupplyPiecesOf(points)).toBe(25);
  });

  it('nomme un point inconnu par son identifiant', () => {
    const points = resupplyPointsOf([
      { resupplyId: 'r', siteId: 'site-x', siteLabel: null, servedByTransfer: false, lines: [] },
    ]);
    expect(points[0]?.label).toBe('site-x');
  });
});
