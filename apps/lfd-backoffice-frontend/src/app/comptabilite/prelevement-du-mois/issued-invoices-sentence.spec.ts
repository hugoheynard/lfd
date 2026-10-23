import { describe, expect, it } from 'vitest';

import type { MonthlyInvoiceReportView } from '@lfd/contracts';

import { issuedInvoicesSentence } from './issued-invoices-sentence';

/** Clôture le 1er octobre à minuit (Paris) : dernier jour de la période, le 30 septembre. */
const CLOSES_AT = '2026-09-30T22:00:00.000Z';

function report(overrides: Partial<MonthlyInvoiceReportView>): MonthlyInvoiceReportView {
  return {
    periodClosesAt: CLOSES_AT,
    periodStartsAt: '2026-08-31T22:00:00.000Z',
    periodLabel: 'du 1er au 30 septembre 2026',
    issued: [],
    blocked: [],
    alreadyInvoiced: 0,
    unbillableOrders: 0,
    ...overrides,
  };
}

describe('issuedInvoicesSentence', () => {
  it('compte les émises et les signalées', () => {
    const sentence = issuedInvoicesSentence(
      report({
        issued: [{ payerCompanyId: 'c1', number: 'F-1', issuedOn: '2026-09-30' }],
        blocked: [{ payerCompanyId: 'c2', message: 'refus' }],
      }),
      CLOSES_AT,
    );

    expect(sentence).toBe('1 facture(s) émise(s), 1 facture(s) signalée(s).');
  });

  it('dit en tête une émission faite après le dernier jour de la période', () => {
    const sentence = issuedInvoicesSentence(
      report({ issued: [{ payerCompanyId: 'c1', number: 'F-1', issuedOn: '2026-10-02' }] }),
      CLOSES_AT,
    );

    expect(sentence.startsWith('Émise(s) en retard, le ')).toBe(true);
  });

  it('nomme les factures déjà émises pour la période', () => {
    expect(issuedInvoicesSentence(report({ alreadyInvoiced: 3 }), CLOSES_AT)).toBe(
      '0 facture(s) émise(s), 0 facture(s) signalée(s), 3 déjà émise(s) pour cette période.',
    );
  });
});
