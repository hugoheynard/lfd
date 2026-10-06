import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les pièces de remise effacées** (`a-la-porte.md`, 2026-10-01). */

function fact(
  payload: Record<string, unknown>,
  actorType: FactInput['actorType'] = 'system',
): FactInput {
  return {
    type: 'order_handover_proof.erased',
    payload,
    subjectType: 'order',
    subjectId: 'ord_1',
    actorName: null,
    actorType,
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

// Un instant recopié dans la charge, jamais comparé à l'horloge.
const TAKEN = '2026-06-01T10:00:00.000Z';

describe('order_handover_proof.erased', () => {
  it('dit la commande, ce qui est parti et pourquoi, sans rien laisser au détail', () => {
    const erased = fact({
      subjectLabel: 'ORD-0001',
      recordedAt: TAKEN,
      signed: true,
      cause: 'retention',
    });
    expect(sentence(erased)).toMatch(
      /^Le système a effacé les preuves de livraison de la commande ORD-0001 \(photo et signature, prises le .+\) : conservation échue$/u,
    );
    expect(renderFact(erased).detail).toEqual([]);
  });

  it('dit « une commande » quand le commerce ne la connaît plus, et la demande', () => {
    expect(sentence(fact({ recordedAt: TAKEN, signed: false, cause: 'request' }))).toMatch(
      /a effacé les preuves de livraison d’une commande \(photo, prise le .+\) : à la demande de la personne$/u,
    );
  });
});
