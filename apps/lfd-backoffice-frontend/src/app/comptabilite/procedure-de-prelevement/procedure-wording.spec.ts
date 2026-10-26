import { describe, expect, it } from 'vitest';

import {
  procedureBatch,
  procedureInvoices,
  procedureView,
} from '../__tests__/collection-procedure-fixture';
import {
  batchShortLabel,
  isPooled,
  pageTitle,
  pooledSentence,
  pooledTitle,
  procedureTabs,
  rhythmsLabel,
} from './procedure-wording';

/** Les mots de la page : le titre dit le lot suivi (Hugo, 2026-10-23), les onglets leur état. */

describe('le titre de la procédure', () => {
  it('dit le rythme et la période du lot suivi', () => {
    expect(pageTitle(procedureView())).toBe(
      'Procédure de prélèvement PRL-261101-M — Mensuel — période du 1er au 31 octobre 2026',
    );
  });

  it('une clôture qui réunit deux rythmes les nomme tous les deux, mensuel d’abord', () => {
    const followed = procedureBatch({ payerModes: ['semimonthly', 'monthly'] });
    expect(pageTitle(procedureView({ followed }))).toBe(
      'Procédure de prélèvement PRL-261101-M — Mensuel et deux fois par mois — période du 1er au 31 octobre 2026',
    );
    expect(rhythmsLabel(['weekly', 'semimonthly', 'monthly'])).toBe(
      'Mensuel, deux fois par mois et hebdomadaire',
    );
  });

  it('aucun lot ouvert, ou un lot annulé : le seul nom de la page', () => {
    expect(pageTitle(procedureView({ followed: null }))).toBe(
      'Procédure de prélèvement PRL-261101-M',
    );
    expect(pageTitle(null)).toBe('Procédure de prélèvement');
    expect(pageTitle(procedureView({ procedure: null, followed: null }))).toBe(
      'Procédure de prélèvement',
    );
    const cancelled = procedureBatch({ status: 'cancelled' });
    expect(pageTitle(procedureView({ followed: cancelled }))).toBe(
      'Procédure de prélèvement PRL-261101-M',
    );
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
      ['invoices', 'check-circle', null],
      ['file', null, null],
      ['returns', 'lock', null],
    ]);
  });
});

describe('l’onglet Factures dans la barre', () => {
  it('se place en 3, et compte en badge les réceptions à confirmer et à facturer', () => {
    const view = procedureView({
      invoices: procedureInvoices({
        state: 'to_do',
        reason: 'receipts_to_confirm',
        figures: { invoiced: 5, receiptConfirmed: 2, receiptToConfirm: 1, awaitingRemainder: 0 },
      }),
    });
    const tab = procedureTabs(view).find((item) => item.key === 'invoices');
    expect(tab).toMatchObject({ label: '3 Factures', badge: 3 });
    expect(procedureTabs(view).map((item) => item.label)).toEqual([
      '1 Comptes',
      '2 Mandats',
      '3 Factures',
      '4 Fichier de prélèvement',
      '5 Retours de la banque',
    ]);
  });
});

describe('l’onglet Factures « partiel » (décision de Hugo du 2026-10-26)', () => {
  it('ne porte pas la coche du « fait » : son icône dit le partiel, sans badge', () => {
    const view = procedureView({
      invoices: procedureInvoices({
        state: 'partial',
        reason: 'awaiting_remainders',
        figures: { invoiced: 3, receiptConfirmed: 0, receiptToConfirm: 0, awaitingRemainder: 1 },
      }),
    });
    const tab = procedureTabs(view).find((item) => item.key === 'invoices');
    expect(tab).toMatchObject({ icon: 'minus', badge: null });
  });
});

describe('la clôture mutualisée', () => {
  it('mutualisée dès que deux rythmes closent le même jour, pas avec un seul', () => {
    expect(isPooled(['weekly', 'monthly'])).toBe(true);
    expect(isPooled(['monthly'])).toBe(false);
    expect(isPooled([])).toBe(false);
  });

  it('le titre du badge dit les rythmes réunis, du plus fréquent au plus rare', () => {
    expect(pooledTitle(['monthly', 'weekly'])).toBe(
      'hebdomadaire + mensuel : une seule clôture, un seul lot',
    );
  });

  it("l'encadré compte les clients de chaque rythme, lus des factures du lot", () => {
    expect(
      pooledSentence({
        code: 'PRL-261102-HM',
        closureDay: '2026-11-02',
        closureModes: ['monthly', 'weekly'],
        payerCounts: [
          { mode: 'monthly', count: 12 },
          { mode: 'weekly', count: 1 },
        ],
      }),
    ).toBe(
      'Clôture mutualisée — hebdomadaire + mensuel : une seule clôture, un seul lot. Clients prélevés : 1 hebdomadaire, 12 mensuels.',
    );
  });

  it("sans lot préparé, l'encadré ne compte rien et le dit", () => {
    expect(
      pooledSentence({
        code: 'PRL-261102-HM',
        closureDay: '2026-11-02',
        closureModes: ['monthly', 'weekly'],
        payerCounts: null,
      }),
    ).toContain('se lira une fois le lot préparé');
  });
});
