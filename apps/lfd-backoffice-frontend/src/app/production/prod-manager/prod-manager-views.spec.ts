import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { permittedProdManagerViews } from './prod-manager-views';

/** Les onglets de Prod manager suivent leurs droits (lot R3d, comme le comptoir). */
function keys(granted: readonly StaffPermission[]): string[] {
  return permittedProdManagerViews((permission) => granted.includes(permission)).map(
    (view) => view.key,
  );
}

describe('les onglets de Prod manager', () => {
  it('ouvre le seul prévisionnel au prévisionnel', () => {
    expect(keys(['production_plan:read'])).toEqual(['previsionnel']);
  });

  it('ouvre les deux à qui tient aussi les réassorts, le prévisionnel en tête', () => {
    expect(keys(['production_plan:read', 'production_resupply:read'])).toEqual([
      'previsionnel',
      'reassorts',
    ]);
  });

  /** Les réassorts sont un droit à part (Hugo, 2026-10-28). */
  it('n’ouvre rien à la seule fiche d’atelier, les seuls réassorts à leur droit', () => {
    expect(keys(['production_worksheet:read'])).toEqual([]);
    expect(keys(['production_resupply:read'])).toEqual(['reassorts']);
  });

  /** Les postes vivent aux Réglages (Hugo, 2026-11-17). */
  it('n’ouvre aucun onglet aux seuls postes', () => {
    expect(keys(['production_workstations:read'])).toEqual([]);
  });

  it('n’ouvre rien au comptoir seul', () => {
    expect(keys(['handover_counter:read'])).toEqual([]);
  });
});

/** L'interrupteur du réassort (plan-interrupteur-du-reassort.md) : éteint, l'onglet disparaît. */
describe('les onglets de Prod manager, réassort éteint', () => {
  it('retire « Réassorts » et garde le prévisionnel', () => {
    const views = permittedProdManagerViews(
      (permission) => ['production_plan:read', 'production_resupply:read'].includes(permission),
      false,
    );
    expect(views.map((view) => view.key)).toEqual(['previsionnel']);
  });
});
