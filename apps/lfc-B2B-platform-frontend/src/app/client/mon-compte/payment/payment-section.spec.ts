import type { CompanyView } from '@lfd/contracts';

import { EN } from '../../copy/en';
import { FR } from '../../copy/fr';
import { IT } from '../../copy/it';
import { asRole, TOMMEUSES } from '../account.fixture';
import { canRequestMonthly, monthlyTermState, monthlyTermView } from './payment-section';

const GRANTED: CompanyView = TOMMEUSES;
const REQUESTED: CompanyView = { ...TOMMEUSES, grantedTerms: [], requestedTerm: 'monthly' };
const NONE: CompanyView = { ...TOMMEUSES, grantedTerms: [], requestedTerm: null };

describe('l’état du crédit mensuel', () => {
  it('se lit sur `grantedTerms` puis `requestedTerm`, et rien d’autre', () => {
    expect(monthlyTermState(GRANTED)).toBe('granted');
    expect(monthlyTermState(REQUESTED)).toBe('requested');
    expect(monthlyTermState(NONE)).toBe('none');
    expect(monthlyTermState(null)).toBe('none');
  });

  /** Le serveur solde la demande à l'accord ; si les deux coexistaient, l'accord l'emporte. */
  it('dit « accordé » quand le terme est accordé, même avec une demande restée posée', () => {
    expect(monthlyTermState({ ...GRANTED, requestedTerm: 'monthly' })).toBe('granted');
  });

  it('ne se demande qu’en owner/admin, et seulement sans accord ni demande en cours', () => {
    expect(canRequestMonthly(NONE)).toBe(true);
    expect(canRequestMonthly(asRole('admin', NONE))).toBe(true);
    expect(canRequestMonthly(asRole('orders', NONE))).toBe(false);
    expect(canRequestMonthly(asRole('billing', NONE))).toBe(false);
    expect(canRequestMonthly(GRANTED)).toBe(false);
    expect(canRequestMonthly(REQUESTED)).toBe(false);
    expect(canRequestMonthly(null)).toBe(false);
  });

  it('nomme chaque état par sa pastille, son ton et sa phrase', () => {
    expect(monthlyTermView('granted', FR.account)).toEqual({
      badge: FR.account.stateActive,
      variant: 'success',
      note: FR.account.termGrantedSub,
    });
    expect(monthlyTermView('requested', FR.account)).toEqual({
      badge: FR.account.stateRequested,
      variant: 'warning',
      note: FR.account.termRequestedSub,
    });
    expect(monthlyTermView('none', FR.account)).toEqual({
      badge: FR.account.stateUnavailable,
      variant: 'neutral',
      note: FR.account.termNoneSub,
    });
  });

  /**
   * Régression : « Accordé le 14/02/2024 · plafond 2 000 € » était écrit en dur
   * et lu par tout le monde. `CompanyView` ne porte ni date d'accord ni
   * plafond : aucune phrase du crédit ne peut plus en affirmer.
   */
  it('n’affirme ni date ni plafond, dans aucune langue et dans aucun état', () => {
    for (const copy of [FR.account, EN.account, IT.account]) {
      expect('termMonthlySub' in copy).toBe(false);
      for (const state of ['granted', 'requested', 'none'] as const) {
        const { badge, note } = monthlyTermView(state, copy);
        expect(`${badge} ${note}`).not.toMatch(/\d/);
        expect(`${badge} ${note}`).not.toMatch(/€/);
      }
    }
  });
});
