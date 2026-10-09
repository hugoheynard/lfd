import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **L'ouverture de la boutique** (`order_opening.updated`, 2026-10-09). */

function updated(payload: Readonly<Record<string, unknown>>): FactInput {
  return {
    type: 'order_opening.updated',
    payload,
    subjectType: 'order_opening',
    subjectId: 'orders',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const sentence = (input: FactInput): string => renderFact(input).sentence.replace(/\s/gu, ' ');

describe('l’ouverture de la boutique (order_opening.updated)', () => {
  it('dit la clientèle fermée, puis celle qui reste ouverte', () => {
    const input = updated({
      ordersOpenToB2b: true,
      ordersOpenToB2c: false,
      previous: { ordersOpenToB2b: true, ordersOpenToB2c: true },
    });

    expect(sentence(input)).toBe(
      'Colette Martin a fermé les commandes aux particuliers ; elles restent ouvertes aux professionnels',
    );
    expect(renderFact(input).detail).toEqual([]);
  });

  it('dit la réouverture', () => {
    expect(
      sentence(
        updated({
          ordersOpenToB2b: true,
          ordersOpenToB2c: false,
          previous: { ordersOpenToB2b: false, ordersOpenToB2c: false },
        }),
      ),
    ).toBe(
      'Colette Martin a rouvert les commandes aux professionnels ; elles restent fermées aux particuliers',
    );
  });

  it('retombe sur la phrase générale si la charge est incomplète', () => {
    expect(sentence(updated({ ordersOpenToB2b: true }))).toBe(
      'Colette Martin a réglé l’ouverture de la boutique',
    );
  });
});
