import { describe, expect, it } from 'vitest';

import { procedureBatch, procedureView } from '../__tests__/collection-procedure-fixture';
import { batchShortLabel, pageTitle, procedureTabs, rhythmsLabel } from './procedure-wording';

/** Les mots de la page : le titre dit le lot suivi (Hugo, 2026-10-23), les onglets leur état. */

describe('le titre de la procédure', () => {
  it('dit le rythme et la période du lot suivi', () => {
    expect(pageTitle(procedureView())).toBe(
      'Procédure de prélèvement — Mensuel — période du 1er au 31 octobre 2026',
    );
  });

  it('une clôture qui réunit deux rythmes les nomme tous les deux, mensuel d’abord', () => {
    const followed = procedureBatch({ payerModes: ['semimonthly', 'monthly'] });
    expect(pageTitle(procedureView({ followed }))).toBe(
      'Procédure de prélèvement — Mensuel et deux fois par mois — période du 1er au 31 octobre 2026',
    );
    expect(rhythmsLabel(['weekly', 'semimonthly', 'monthly'])).toBe(
      'Mensuel, deux fois par mois et hebdomadaire',
    );
  });

  it('aucun lot ouvert, ou un lot annulé : le seul nom de la page', () => {
    expect(pageTitle(procedureView({ followed: null }))).toBe('Procédure de prélèvement');
    expect(pageTitle(null)).toBe('Procédure de prélèvement');
    const cancelled = procedureBatch({ status: 'cancelled' });
    expect(pageTitle(procedureView({ followed: cancelled }))).toBe('Procédure de prélèvement');
  });

  it('un lot sans rythme connu garde sa période, sans inventer de rythme', () => {
    expect(batchShortLabel(procedureBatch({ payerModes: [] }))).toBe(
      'période du 1er au 31 octobre 2026',
    );
    expect(batchShortLabel(procedureBatch({ payerModes: ['weekly'] }))).toBe(
      'Hebdomadaire · période du 1er au 31 octobre 2026',
    );
  });
});

describe('la barre d’onglets', () => {
  it('cadenas sur un onglet verrouillé, coche sur un fait, le nombre à faire en badge', () => {
    const tabs = procedureTabs(procedureView());
    expect(tabs.map((tab) => [tab.key, tab.icon ?? null, tab.badge ?? null])).toEqual([
      ['accounts', 'check-circle', null],
      ['mandates', null, 2],
      ['file', null, null],
      ['returns', 'lock', null],
    ]);
  });
});
