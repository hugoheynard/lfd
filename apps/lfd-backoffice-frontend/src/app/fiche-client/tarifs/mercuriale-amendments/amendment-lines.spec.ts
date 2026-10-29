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
});
