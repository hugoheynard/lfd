import { describe, expect, it } from 'vitest';

import { purchaseScenarioSizeLabel, refKey, restoredKeys } from './purchase-scenarios';

describe('les dérivations des scénarios d’achat', () => {
  it('la clé d’une référence est celle des choix du tableau', () => {
    expect(refKey({ source: 'bin_type', id: 'bt1' })).toBe('bin_type:bt1');
  });

  it('ne coche que ce que l’écran propose encore, dans l’ordre du scénario', () => {
    const keys = restoredKeys(
      [
        { source: 'fleet', id: 'v2' },
        { source: 'candidate', id: 'gone' },
        { source: 'candidate', id: 'pv1' },
      ],
      [{ key: 'candidate:pv1' }, { key: 'fleet:v2' }],
    );
    expect(keys).toEqual(['fleet:v2', 'candidate:pv1']);
  });

  it('dit la taille de la sélection, au singulier comme au pluriel', () => {
    const row = {
      id: 'ps1',
      name: 'Essai',
      updatedAt: '2026-01-01T08:00:00.000Z',
      updatedBy: null,
      archivedAt: null,
    };
    expect(purchaseScenarioSizeLabel({ ...row, vehicles: 1, formats: 3 })).toBe(
      '1 véhicule × 3 formats',
    );
  });
});
