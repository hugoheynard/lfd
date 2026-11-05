import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Le réglage global de livraison** (`delivery_pricing.updated`, 0b). */

const NOTHING = { fee: null, freeDeliveryThresholdCents: null };

function updated(payload: Readonly<Record<string, unknown>>): FactInput {
  return {
    type: 'delivery_pricing.updated',
    payload,
    subjectType: 'delivery_pricing',
    subjectId: 'delivery_pricing',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const sentence = (input: FactInput): string => renderFact(input).sentence.replace(/\s/gu, ' ');

describe('le réglage global de livraison (delivery_pricing.updated)', () => {
  it('dit le frais de la seule clientèle qui a changé, avec sa valeur', () => {
    const input = updated({
      b2b: { fee: { cents: 900 }, freeDeliveryThresholdCents: null },
      b2c: { fee: { bp: 1_000 }, freeDeliveryThresholdCents: null },
      previous: { b2b: NOTHING, b2c: { fee: { bp: 1_000 }, freeDeliveryThresholdCents: null } },
    });

    expect(sentence(input)).toMatch(
      /^Colette Martin a réglé le frais de livraison des professionnels à 9,00 €$/u,
    );
  });

  it('dit le retour à l’ancien frais des zones', () => {
    const input = updated({
      b2b: NOTHING,
      b2c: NOTHING,
      previous: { b2b: { fee: { cents: 900 }, freeDeliveryThresholdCents: null }, b2c: NOTHING },
    });

    expect(sentence(input)).toBe(
      'Colette Martin a retiré le frais de livraison des professionnels : chaque zone reprend son ancien frais',
    );
  });

  it('un geste qui ne touche que le franco reste une phrase lisible', () => {
    const input = updated({
      b2b: { fee: null, freeDeliveryThresholdCents: 5_000 },
      b2c: NOTHING,
      previous: { b2b: NOTHING, b2c: NOTHING },
    });

    expect(sentence(input)).toBe('Colette Martin a réglé le prix de la livraison');
  });
});
