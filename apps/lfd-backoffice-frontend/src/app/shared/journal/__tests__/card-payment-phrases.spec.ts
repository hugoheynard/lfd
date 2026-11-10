import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les faits du bloc `card-payment`** (plan M2, §3.3, lot P1.b) : le sujet
 * est la demande de remboursement, son libellé ce qu'on rembourse.
 */
function cardFact(
  type: string,
  payload: Record<string, unknown>,
  actor: { readonly actorName: string | null; readonly actorType: 'staff' | 'system' } = {
    actorName: null,
    actorType: 'system',
  },
): FactInput {
  return { type, payload, subjectType: 'card_payment', subjectId: 'req_1', ...actor };
}

/** Les espaces insécables des nombres français, rendus lisibles pour l'assertion. */
function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const STAFF = { actorName: 'Colette Martin', actorType: 'staff' } as const;

describe('les remboursements par carte', () => {
  it('dit l’émission, l’émis et l’annoncé', () => {
    expect(
      sentence(
        cardFact('card_payment.issued', {
          subjectLabel: 'Commande CMD-142',
          generation: 1,
          announcedCents: 2_110,
          issuedCents: 2_110,
        }),
      ),
    ).toContain(
      'Le remboursement de « Commande CMD-142 » a été émis chez le prestataire : 21,10 € (annoncés : 21,10 €)',
    );
  });

  it('dit l’essai manqué, son code brut, et que le système réessaie', () => {
    expect(
      sentence(
        cardFact('card_payment.attempt_failed', {
          subjectLabel: 'Commande CMD-142',
          generation: 1,
          failure: 'unavailable',
        }),
      ),
    ).toContain(
      'Un essai d’émettre le remboursement de « Commande CMD-142 » n’a pas abouti chez le prestataire (unavailable) — le système réessaie',
    );
  });

  it('dit l’arrêt et les deux gestes qui en sortent', () => {
    expect(
      sentence(
        cardFact('card_payment.stopped', {
          subjectLabel: 'Commande CMD-142',
          generation: 2,
          failure: 'declined:expired_card',
        }),
      ),
    ).toContain(
      'Le remboursement de « Commande CMD-142 » est arrêté (declined:expired_card) : il attend « Relancer » ou « rendu autrement »',
    );
  });

  it('« Relancer » et « rendu autrement » sont des gestes de l’équipe, à l’actif', () => {
    expect(
      sentence(
        cardFact(
          'card_payment.retried',
          { subjectLabel: 'Commande CMD-142', generation: 2 },
          STAFF,
        ),
      ),
    ).toContain('Colette Martin a relancé le remboursement de « Commande CMD-142 »');
    expect(
      sentence(
        cardFact(
          'card_payment.settled_elsewhere',
          { subjectLabel: 'Commande CMD-142', amountCents: 2_110, reason: 'Virement le 3' },
          STAFF,
        ),
      ),
    ).toContain(
      'Colette Martin a noté le remboursement de « Commande CMD-142 » rendu autrement : 21,10 € — « Virement le 3 »',
    );
  });

  it('dit l’événement hors de nos paiements, son type et son compte', () => {
    expect(
      sentence(
        cardFact('card_payment.unmatched', { account: 'lfc-stripe', eventType: 'charge.refunded' }),
      ),
    ).toContain(
      'Un événement du prestataire (charge.refunded) est arrivé sur le compte lfc-stripe sans porter sur aucun de nos paiements',
    );
  });
});
