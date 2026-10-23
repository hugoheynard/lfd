import { describe, expect, it } from 'vitest';

import { renderFact } from '../render-fact';

/** Le fait du lot rejeté par la banque (plan `plan-lot-rejete-par-la-banque.md`). */
describe('le lot rejeté par la banque', () => {
  it('nomme l’auteur, le lot, l’entité, le motif et les commandes rendues à prélever', () => {
    const { sentence } = renderFact({
      type: 'collection.batch_rejected_by_bank',
      payload: {
        subjectLabel: 'Lot B2B 202609',
        legalEntity: { id: 'le_1', name: 'La Folie Douce SAS' },
        scheme: 'B2B',
        cycleClosesAt: '2026-09-30T22:00:00.000Z',
        lineCount: 2,
        totalCents: 21_100,
        reason: 'PSR1 : schéma invalide',
        releasedOrderCount: 3,
      },
      subjectType: 'collection_batch',
      subjectId: 'b_1',
      actorName: 'Colette Martin',
      actorType: 'staff',
    });

    expect(sentence).toContain(
      'Colette Martin a déclaré le fichier du lot « Lot B2B 202609 » de l’entité émettrice « La Folie Douce SAS » rejeté par la banque (PSR1)',
    );
    expect(sentence).toContain('« PSR1 : schéma invalide »');
    expect(sentence).toContain('3 commande(s) redeviennent à prélever');
  });
});
