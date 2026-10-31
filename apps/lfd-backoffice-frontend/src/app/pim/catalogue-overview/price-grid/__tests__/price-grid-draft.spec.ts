import { describe, expect, it } from 'vitest';

import { AUDIENCE_OPTIONS, EMPTY_DRAFT, payloadOf, questionOf } from '../price-grid-draft';

const PROMO = {
  id: 'p',
  label: 'P',
  effect: { kind: 'percent_off', value: 1000 },
  cumulative: false,
} as const;

describe('le brouillon de la grille de prix', () => {
  it('aucune question tant que le point ou la société manque', () => {
    expect(questionOf(EMPTY_DRAFT)).toBeNull();
    expect(questionOf({ ...EMPTY_DRAFT, pickupId: 'pt', audience: 'company' })).toBeNull();
  });

  it('propose les deux pros types, posés sans société', () => {
    expect(AUDIENCE_OPTIONS.map((option) => option.label)).toEqual([
      'Pros (société active)',
      "Pros en cours d'inscription",
      'Particuliers inscrits',
      'Particuliers sans compte',
      'Une société précise',
    ]);
    expect(
      questionOf({ ...EMPTY_DRAFT, pickupId: 'pt', audience: 'pro_pending' })?.audience,
    ).toEqual({ kind: 'pro_pending' });
  });

  it('un jour vide se dit « maintenant »', () => {
    expect(questionOf({ ...EMPTY_DRAFT, pickupId: 'pt' })?.day).toBeNull();
    expect(questionOf({ ...EMPTY_DRAFT, pickupId: 'pt', day: '2030-02-01' })?.day).toBe(
      '2030-02-01',
    );
  });

  it('une remise décochée ne part pas ; une remise sans choix part en colonne', () => {
    const question = questionOf({ ...EMPTY_DRAFT, method: 'delivery', zoneId: 'z' });
    if (question === null) {
      throw new Error('question attendue');
    }
    const other = { ...PROMO, id: 'q' };

    expect(payloadOf(question, [PROMO, other], new Map([['q', 'unchecked']]), true)).toEqual({
      ...question,
      basketPromotions: [{ promotionId: 'p', part: 'column' }],
      pricePerKg: true,
    });
  });
});
