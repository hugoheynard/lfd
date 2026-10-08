import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les remboursements Stripe constatés** (lot R1 du plan
 * `plan-facture-carte-et-remboursements.md`) : au passif, le geste a eu lieu
 * chez Stripe, le système ne fait que le constater.
 */

function refundFact(type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'order',
    subjectId: 'ord_1',
    actorName: null,
    actorType: 'system',
  };
}

/** Les espaces insécables des nombres français, rendus lisibles pour l'assertion. */
function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

describe('les remboursements constatés', () => {
  it('dit le montant, la commande, le statut et le cumul', () => {
    expect(
      sentence(
        refundFact('order.refund_recorded', {
          subjectLabel: 'CMD-142',
          amountCents: 1_250,
          refundedCents: 1_250,
          status: 'succeeded',
        }),
      ),
    ).toBe(
      'Un remboursement Stripe de 12,50 € a été constaté sur la commande CMD-142 (remboursé) — remboursé au total : 12,50 €',
    );
  });

  it('dit le remboursement total', () => {
    expect(
      sentence(
        refundFact('order.fully_refunded', { subjectLabel: 'CMD-142', refundedCents: 2_110 }),
      ),
    ).toBe(
      'Les remboursements Stripe atteignent le total de la commande CMD-142 : elle est remboursée en totalité (21,10 €)',
    );
  });

  it('dit le refus et son motif', () => {
    expect(
      sentence(
        refundFact('order.refund_rejected', {
          subjectLabel: 'CMD-142',
          amountCents: 500,
          currency: 'usd',
          status: 'succeeded',
          reason: 'currency',
        }),
      ),
    ).toBe(
      'Un remboursement Stripe de 5,00 € n’a pas été noté sur la commande CMD-142 : pas en euros',
    );
  });
});
