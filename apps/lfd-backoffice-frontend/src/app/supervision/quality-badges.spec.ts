import { describe, expect, it } from 'vitest';

import type { QualityBoardView, QualityLineStatus } from '@lfd/contracts';

import { lineBadge, orderBadge, qualityLookup, staleDetail, worstBadge } from './quality-badges';

function line(overrides: Partial<QualityLineStatus> = {}): QualityLineStatus {
  return {
    sku: 'cro',
    verdict: 'ok',
    checkedAt: 'x',
    quantitySeen: 96,
    currentQuantity: 96,
    stale: false,
    ...overrides,
  };
}

describe('les pastilles du contrôle qualité', () => {
  it('dit chaque verdict en toutes lettres : « warning » se dit Réserve', () => {
    expect(lineBadge(line()).label).toBe('Contrôle · OK');
    expect(lineBadge(line({ verdict: 'warning' }))).toMatchObject({
      label: 'Contrôle · Réserve',
      variant: 'warning',
      detail: null,
    });
    expect(
      orderBadge({ orderId: 'o', reference: 'R', verdict: 'blocking', checkedAt: 'x' }),
    ).toMatchObject({ label: 'Contrôle · Bloquant', variant: 'alert' });
  });

  /** D5 : « contrôlé sur 96, compte actuel 120 — à revoir ». */
  it('dit la péremption d’un contrôle de ligne, avec les deux comptes', () => {
    const stale = line({ currentQuantity: 120, stale: true });

    expect(lineBadge(stale)).toMatchObject({ label: 'Contrôle · À revoir', variant: 'warning' });
    expect(staleDetail(stale)).toBe('Contrôlé sur 96, compte actuel 120 — à revoir');
    expect(staleDetail(line({ currentQuantity: null, stale: true }))).toBe(
      'Contrôlé sur 96, le produit a quitté le compte — à revoir',
    );
  });

  /** D5 : un lot jugé dangereux ne devient pas sain parce qu'on en a fait plus. */
  it('garde un blocage périmé bloquant', () => {
    const badge = lineBadge(line({ verdict: 'blocking', currentQuantity: 120, stale: true }));

    expect(badge.variant).toBe('alert');
    expect(badge.label).toBe('Contrôle · Bloquant, à revoir');
    expect(badge.detail).toContain('à revoir');
  });

  it('retient la pire pastille : bloquant, puis à revoir, puis réserve, puis OK', () => {
    const ok = lineBadge(line());
    const warning = lineBadge(line({ verdict: 'warning' }));
    const stale = lineBadge(line({ stale: true }));
    const blocking = lineBadge(line({ verdict: 'blocking' }));

    expect(worstBadge([ok, null, warning])).toBe(warning);
    expect(worstBadge([warning, stale])).toBe(stale);
    expect(worstBadge([stale, blocking, ok])).toBe(blocking);
    expect(worstBadge([null, null])).toBeNull();
  });

  it('indexe les lignes par SKU et les commandes par numéro — sans celles hors plan', () => {
    const board: QualityBoardView = {
      date: '2026-09-25',
      lines: [line()],
      orders: [
        { orderId: 'o-1', reference: 'CMD-1', verdict: 'ok', checkedAt: 'x' },
        { orderId: 'o-2', reference: null, verdict: 'blocking', checkedAt: 'x' },
      ],
      heldOrderIds: ['o-2'],
    };
    const lookup = qualityLookup(board);

    expect([...lookup.lines.keys()]).toEqual(['cro']);
    expect([...lookup.orders.keys()]).toEqual(['CMD-1']);
    expect(qualityLookup(null).lines.size).toBe(0);
  });
});
