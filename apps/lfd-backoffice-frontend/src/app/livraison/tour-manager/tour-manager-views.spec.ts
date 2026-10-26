import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { TOUR_MANAGER_PERMISSIONS, permittedTourManagerViews } from './tour-manager-views';

/** Les onglets de Tour manager suivent leurs droits (Hugo, 2026-10-26). */
function keys(granted: readonly StaffPermission[]): string[] {
  return permittedTourManagerViews((permission) => granted.includes(permission)).map(
    (view) => view.key,
  );
}

describe('les onglets de Tour manager', () => {
  it('ouvre les deux à qui tient les deux droits, les tournées en tête', () => {
    expect(keys(['delivery_rounds:read', 'delivery_run_sheet:read'])).toEqual([
      'tournees',
      'feuille-de-route',
    ]);
  });

  it('n’ouvre que la feuille de route à qui ne lit qu’elle', () => {
    expect(keys(['delivery_run_sheet:read'])).toEqual(['feuille-de-route']);
  });

  it('n’ouvre que les tournées à qui ne lit qu’elles', () => {
    expect(keys(['delivery_rounds:read'])).toEqual(['tournees']);
  });

  it('n’ouvre rien au chargement seul', () => {
    expect(keys(['delivery_loading:read'])).toEqual([]);
  });

  it('ouvre l’entrée du menu sur l’un OU l’autre droit', () => {
    expect([...TOUR_MANAGER_PERMISSIONS].sort()).toEqual([
      'delivery_rounds:read',
      'delivery_run_sheet:read',
    ]);
  });
});
