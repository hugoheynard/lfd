import { describe, expect, it } from 'vitest';

import { procedureRow } from '../__tests__/collection-procedure-fixture';
import { procedureRowTitle } from './procedure-list-wording';

describe('procedureRowTitle — le titre d’une ligne', () => {
  it('un seul rythme : le rythme, puis sa période', () => {
    expect(procedureRowTitle(procedureRow())).toBe('Mensuel · période du 1er au 31 octobre 2026');
  });

  /**
   * Régression : une clôture mutualisée au 1er décembre se titrait « période du
   * 30 au 30 novembre », la seule journée depuis la clôture hebdomadaire.
   */
  it('une clôture mutualisée : la période de chacun de ses rythmes', () => {
    const row = procedureRow({
      modes: ['monthly', 'semimonthly'],
      periodLabel: 'du 30 au 30 novembre 2026',
      periods: [
        { mode: 'monthly', label: 'du 1er au 30 novembre 2026' },
        { mode: 'semimonthly', label: 'du 16 au 30 novembre 2026' },
      ],
    });

    expect(procedureRowTitle(row)).toBe(
      'Mensuel : du 1er au 30 novembre 2026 · Deux fois par mois : du 16 au 30 novembre 2026',
    );
  });
});
