import { describe, expect, it } from 'vitest';

import {
  procedureBatch,
  procedureInvoices,
  procedureView,
} from '../__tests__/collection-procedure-fixture';
import {
  followedHeadline,
  isPooled,
  pageTitle,
  periodsTitle,
  pooledSentence,
  pooledTitle,
  procedureTabs,
  rhythmsLabel,
} from './procedure-wording';

/** Les mots de la page : le titre dit le lot suivi (Hugo, 2026-10-23), les onglets leur état. */

describe('le titre de la procédure', () => {
  const OCTOBER = 'du 1er au 31 octobre 2026';

  it('dit le rythme et la période de la procédure', () => {
    expect(pageTitle(procedureView())).toBe(
      `Procédure de prélèvement PRL-261101-M — Mensuel · période ${OCTOBER}`,
    );
  });

  /**
   * Régression : une clôture mutualisée au 1er décembre, le lendemain d'une
   * clôture hebdomadaire, se titrait « période du 30 au 30 novembre ».
   */
  it('une clôture mutualisée dit la période de chacun de ses rythmes, mensuel d’abord', () => {
    const base = procedureView();
    const procedure =
      base.procedure === null
        ? null
        : {
            ...base.procedure,
            code: 'PRL-261201-BM',
            periods: [
              { mode: 'monthly' as const, label: 'du 1er au 30 novembre 2026' },
              { mode: 'semimonthly' as const, label: 'du 16 au 30 novembre 2026' },
            ],
          };
    expect(pageTitle({ ...base, procedure })).toBe(
      'Procédure de prélèvement PRL-261201-BM — Mensuel : du 1er au 30 novembre 2026 · Deux fois par mois : du 16 au 30 novembre 2026',
    );
    expect(rhythmsLabel(['weekly', 'semimonthly', 'monthly'])).toBe(
      'Mensuel, deux fois par mois et hebdomadaire',
    );
  });

  it('la période se dit même sans lot ouvert', () => {
    expect(pageTitle(procedureView({ followed: null }))).toBe(
      `Procédure de prélèvement PRL-261101-M — Mensuel · période ${OCTOBER}`,
    );
  });

  it('sans procédure : le seul nom de la page', () => {
    expect(pageTitle(null)).toBe('Procédure de prélèvement');
    expect(pageTitle(procedureView({ procedure: null, followed: null }))).toBe(
      'Procédure de prélèvement',
    );
  });

  it('sans période servie : celle du lot suivi, sans inventer de rythme', () => {
    expect(periodsTitle([], [], OCTOBER)).toBe(`période ${OCTOBER}`);
    expect(periodsTitle([], ['weekly'], OCTOBER)).toBe(`Hebdomadaire · période ${OCTOBER}`);
    const base = procedureView();
    const procedure = base.procedure === null ? null : { ...base.procedure, periods: [] };
    expect(pageTitle({ ...base, procedure })).toBe(
      `Procédure de prélèvement PRL-261101-M — Mensuel · période ${OCTOBER}`,
    );
    const cancelled = procedureBatch({ status: 'cancelled' });
    expect(pageTitle({ ...base, procedure, followed: cancelled })).toBe(
      'Procédure de prélèvement PRL-261101-M',
    );
  });

  it('l’en-tête du lot suivi : quand on prélève, puis jusqu’à quand déposer', () => {
    expect(followedHeadline(procedureBatch())).toMatch(
      /^Prélèvement SEPA (CORE|B2B) (le .+ )?· (déposer avant le .+ à .+|limite de dépôt à renseigner)\.$/,
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
        periods: [],
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
        periods: [],
        payerCounts: null,
      }),
    ).toContain('se lira une fois le lot préparé');
  });
});
