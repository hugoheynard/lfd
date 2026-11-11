import { describe, expect, it } from 'vitest';

import { amendmentLine } from './amendment-lines';

describe('amendmentLine', () => {
  it('dit la fenêtre, ce qu’il ouvre et arrête, le motif et l’auteur', () => {
    expect(
      amendmentLine({
        id: 'amd_1',
        validFrom: '2026-11-01T00:00:00.000Z',
        validTo: null,
        reason: 'Prix revu',
        openedSkus: ['VIE-001-1'],
        endedSkus: ['VIE-001-1'],
        createdBy: 'staff_1',
        createdByName: 'Marie Curie',
      }),
    ).toBe(
      'Du 01/11/2026 à la fin de la mercuriale — ouvre VIE-001-1 · arrête VIE-001-1 — « Prix revu » — Marie Curie',
    );
  });

  it('borne la fenêtre, et retombe sur l’identifiant sans nom d’auteur', () => {
    expect(
      amendmentLine({
        id: 'amd_2',
        validFrom: '2026-11-01T00:00:00.000Z',
        validTo: '2026-12-01T00:00:00.000Z',
        reason: 'Ajout',
        openedSkus: ['VIE-002-1'],
        endedSkus: [],
        createdBy: 'system',
        createdByName: null,
      }),
    ).toBe('Du 01/11/2026 au 01/12/2026 — ouvre VIE-002-1 — « Ajout » — system');
  });

  it('dit la remise générale qu’il pose, ou qu’il l’arrête', () => {
    const base = {
      id: 'amd_d',
      validFrom: '2026-11-01T00:00:00.000Z',
      validTo: null,
      reason: 'Accord',
      openedSkus: [],
      endedSkus: [],
      createdBy: 'staff_1',
      createdByName: 'Marie Curie',
    };
    expect(
      amendmentLine(
        {
          ...base,
          generalDiscount: {
            set: {
              mode: 'all_except',
              baseBp: 2000,
              rules: [{ target: 'category', targetId: 'c', bp: null }],
            },
          },
        },
        null,
        new Map([['c', 'Chocolat']]),
      ),
    ).toContain('remise générale : −20 % sur tout le catalogue, sauf : Chocolat : exclue');
    expect(amendmentLine({ ...base, generalDiscount: { set: null } })).toContain(
      'arrête la remise générale',
    );
  });
});
