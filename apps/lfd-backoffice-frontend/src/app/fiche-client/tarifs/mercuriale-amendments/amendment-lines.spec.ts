import { describe, expect, it } from 'vitest';

import { amendmentEntry } from './amendment-lines';

const BASE = {
  id: 'amd_1',
  validFrom: '2026-11-01T00:00:00.000Z',
  validTo: null,
  reason: 'Prix revu',
  openedSkus: [] as string[],
  endedSkus: [] as string[],
  createdBy: 'staff_1',
  createdByName: 'Marie Curie' as string | null,
};

describe('amendmentEntry', () => {
  it('dit la période, ce qu’il ouvre et arrête (nommé), le motif et l’auteur', () => {
    const entry = amendmentEntry(
      { ...BASE, openedSkus: ['VIE-001-1'], endedSkus: ['VIE-002-1'] },
      null,
      new Map([['VIE-001-1', 'Croissant (VIE-001-1)']]),
    );
    expect(entry.period).toBe('Depuis le 01/11/2026');
    expect(entry.changes).toEqual([
      'Prix ferme ouvert : Croissant (VIE-001-1)',
      'Prix ferme arrêté : VIE-002-1',
    ]);
    expect(entry.byline).toBe('« Prix revu » — Marie Curie');
  });

  it('borne la période, et retombe sur l’identifiant sans nom d’auteur', () => {
    const entry = amendmentEntry({
      ...BASE,
      validTo: '2026-12-01T00:00:00.000Z',
      createdBy: 'system',
      createdByName: null,
    });
    expect(entry.period).toBe('Du 01/11/2026 au 01/12/2026');
    expect(entry.byline).toBe('« Prix revu » — system');
  });

  it('dit la remise qu’il pose ou arrête, et le cumul des promotions', () => {
    const set = amendmentEntry(
      {
        ...BASE,
        generalDiscount: {
          set: {
            mode: 'all_except',
            baseBp: 2000,
            rules: [{ target: 'category', targetId: 'c', bp: null }],
          },
        },
        promotionPolicy: { mode: 'none', promotionIds: [] },
      },
      null,
      new Map([['c', 'Chocolat']]),
    );
    expect(set.changes).toEqual([
      'Remise générale : −20 % sur le reste du catalogue ; Chocolat exclue',
      'Promotions en plus des prix négociés : non',
    ]);
    expect(amendmentEntry({ ...BASE, generalDiscount: { set: null } }).changes).toEqual([
      'Remise générale arrêtée',
    ]);
  });
});
