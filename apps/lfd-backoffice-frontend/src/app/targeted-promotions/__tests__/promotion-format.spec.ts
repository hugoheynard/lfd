import { describe, expect, it } from 'vitest';

import {
  audiencePhrase,
  effectPhrase,
  fulfillmentPhrase,
  originPhrase,
  windowPhrase,
} from '../promotion-format';

describe('les mots de l’écran Promotions', () => {
  it('dit le public dans son groupe', () => {
    expect(audiencePhrase({ kind: 'everyone', companyId: null })).toBe('Tout le monde');
    expect(audiencePhrase({ kind: 'individuals_registered', companyId: null })).toBe(
      'Particuliers · inscrits',
    );
    expect(audiencePhrase({ kind: 'pros_pending', companyId: null })).toBe(
      "Pros · en cours d'inscription",
    );
    expect(audiencePhrase({ kind: 'everyone_but_active_pros', companyId: null })).toBe(
      'Tous sauf les pros actifs',
    );
  });

  it('nomme le point de retrait quand il est connu, son identifiant sinon', () => {
    const names = new Map([['pk_coeur', 'Cœur de station']]);
    expect(fulfillmentPhrase({ kind: 'pickup_point', pickupId: 'pk_coeur' }, names)).toBe(
      'Retrait · Cœur de station',
    );
    expect(fulfillmentPhrase({ kind: 'pickup_point', pickupId: 'pk_x' }, names)).toBe(
      'Retrait · pk_x',
    );
    expect(fulfillmentPhrase({ kind: 'any', pickupId: null }, names)).toBe(
      'Tous les acheminements',
    );
  });

  it("dit l'effet dans son unité", () => {
    expect(effectPhrase({ kind: 'percent_off', value: 2000 })).toBe('−20 %');
    expect(effectPhrase({ kind: 'percent_off', value: 1250 })).toBe('−12,5 %');
    expect(effectPhrase({ kind: 'unit_amount_off', value: 50_000 })).toMatch(/^−0,50\s€ l'unité$/u);
    expect(effectPhrase({ kind: 'basket_amount_off', value: 500 })).toMatch(
      /^−5,00\s€ sur le panier$/u,
    );
  });

  it('dit la fenêtre, fin exclue', () => {
    expect(windowPhrase('2026-10-31T23:00:00.000Z', '2026-11-30T23:00:00.000Z')).toBe(
      'Du 1 novembre 2026 au 30 novembre 2026',
    );
    expect(windowPhrase('2026-10-31T23:00:00.000Z', null)).toBe(
      'Depuis le 1 novembre 2026, sans fin',
    );
  });

  it("dit l'origine d'une reprise", () => {
    expect(originPhrase(null)).toBeNull();
    expect(originPhrase('pickup_discount:pk_coeur:b2b')).toContain('remise de retrait');
    expect(originPhrase('price_rule:r_1')).toContain('Règles de prix');
  });
});
