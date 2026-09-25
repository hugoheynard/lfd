import { describe, expect, it } from 'vitest';

import { staffRoleLabelOf } from './staff-roles';

/** La liste et la fiche disent le même libellé — la fiche de secours se dit comme telle. */
describe('staffRoleLabelOf', () => {
  it('nomme la porte de secours', () => {
    expect(staffRoleLabelOf({ roleLabel: 'Super administrateur', isRescue: true })).toBe(
      'Super administrateur · porte de secours',
    );
  });

  it('rend le libellé tel quel pour une fiche ordinaire', () => {
    expect(staffRoleLabelOf({ roleLabel: 'Commercial', isRescue: false })).toBe('Commercial');
  });
});
