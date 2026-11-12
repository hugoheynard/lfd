import { describe, expect, it } from 'vitest';

import { renderFact } from '../render-fact';

/** La phrase du virement reçu (plan virement, V7). Le jour est dit, jamais comparé. */
describe('le virement reçu', () => {
  const payload = {
    subjectLabel: 'Le Bistrot',
    legalEntity: { id: 'le_1', name: 'La Folie Douce SAS' },
    amountCents: 15_455,
    receivedOn: '2026-11-18',
    reference: 'FA-LFD-2026-000001',
    invoices: ['FA-LFD-2026-000001', 'FA-LFD-2026-000002'],
  };

  it('dit le payeur, le jour, le montant, la référence et les factures réglées — rien en reste', () => {
    const rendered = renderFact({
      type: 'bank_transfer.received',
      payload,
      subjectType: 'company',
      subjectId: 'co_1',
      actorName: 'Colette Martin',
      actorType: 'staff',
    });

    expect(rendered.sentence).toContain('a enregistré le virement reçu de « Le Bistrot »');
    expect(rendered.sentence).toContain('154,55');
    expect(rendered.sentence).toContain('référence « FA-LFD-2026-000001 »');
    expect(rendered.sentence).toContain(
      'il règle les factures FA-LFD-2026-000001, FA-LFD-2026-000002',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('une seule facture se dit au singulier', () => {
    const { sentence } = renderFact({
      type: 'bank_transfer.received',
      payload: { ...payload, invoices: ['FA-LFD-2026-000001'] },
      subjectType: 'company',
      subjectId: 'co_1',
      actorName: 'Colette Martin',
      actorType: 'staff',
    });

    expect(sentence).toContain('il règle la facture FA-LFD-2026-000001');
  });
});
