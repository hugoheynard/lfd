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
  it('ouvre les deux au prévisionnel, le prévisionnel en tête', () => {
    expect(keys(['production_plan:read'])).toEqual(['previsionnel', 'reassorts']);
  });

  it('ouvre les seuls réassorts à la seule fournée — le droit de l’ancienne entrée', () => {
    expect(keys(['production_worksheet:read'])).toEqual(['reassorts']);
  });

  it('n’ouvre rien au comptoir seul', () => {
    expect(keys(['handover_counter:read'])).toEqual([]);
  });
});
