import { describe, expect, it } from 'vitest';

import {
  draftOf,
  draftProblem,
  emptyDraft,
  switchType,
  termsOf,
  type PromotionDraft,
} from '../promotion-draft';
import { fulfillmentPhrase, summaryPhrase } from '../promotion-format';
import { draftSummary } from '../promotion-summary';
import { promotionView } from '../promotion.testing';

/** La promotion « Sur la livraison » (`plan-livraison-offerte.md`, § 2.3). */
const TODAY = '2026-11-02';
const named = (): PromotionDraft => ({
  ...emptyDraft(TODAY, null),
  internalName: 'Fidèles',
  labelFr: 'Livraison offerte — client fidèle',
  effectValue: '20',
  minQuantity: '3',
  cumulative: true,
  rules: [{ target: 'category', targetId: 'c_choc', eligible: false }],
});
const onDelivery = (over: Partial<PromotionDraft> = {}): PromotionDraft => ({
  ...switchType(named(), {}, 'delivery_fee').draft,
  ...over,
});

/** `Intl` sépare les euros d'une espace insécable fine. */
const spaced = (text: string): string => text.replace(/\s/gu, ' ');

const view = promotionView({
  applicationPoint: 'delivery_fee',
  effect: { kind: 'free_delivery', value: 0 },
  fulfillment: { kind: 'delivery_fee', delivery: { zones: ['z_centre'] } },
  scope: { mode: 'all_except', rules: [] },
  conditions: [{ kind: 'min_basket', cents: 4990 }],
});

describe('la promotion « Sur la livraison »', () => {
  it('rejoint le genre sans effet à saisir, ni articles', () => {
    const draft = onDelivery();
    expect(draft).toMatchObject({ effectKind: 'free_delivery', effectValue: '0', rules: [] });
    expect(draftProblem(draft)).toBeNull();
  });

  it('envoie la forme que le serveur admet : ni portée, ni cumul, ni quantité', () => {
    const terms = termsOf(onDelivery({ minBasket: '50' }));
    expect(terms).toMatchObject({
      effect: { kind: 'free_delivery', value: 0 },
      fulfillment: { kind: 'delivery_fee', delivery: 'all' },
      scope: { mode: 'all_except', rules: [] },
      cumulative: false,
      ownFloor: null,
      tileText: null,
      conditions: [{ kind: 'min_basket', cents: 5000 }],
    });
  });

  it('sans panier minimum, la livraison est toujours offerte', () => {
    expect(termsOf(onDelivery()).conditions).toEqual([]);
  });

  it('envoie les zones choisies, triées', () => {
    const draft = onDelivery({ delivery: { on: false, all: false, ids: ['z_b', 'z_a'] } });
    expect(termsOf(draft).fulfillment).toEqual({
      kind: 'delivery_fee',
      delivery: { zones: ['z_a', 'z_b'] },
    });
    expect(draftProblem({ ...draft, delivery: { on: true, all: false, ids: [] } })).toContain(
      'au moins une zone',
    );
  });

  it('refuse un panier minimum illisible ou plus fin que le centime', () => {
    expect(draftProblem(onDelivery({ minBasket: 'cinquante' }))).toContain('panier minimum');
    expect(draftProblem(onDelivery({ minBasket: '49,999' }))).toContain('panier minimum');
    expect(draftProblem(onDelivery({ minBasket: '49,90' }))).toBeNull();
  });

  it('un aller-retour rend l’effet et les articles de la remise au panier', () => {
    const basket = switchType(named(), {}, 'basket');
    const away = switchType(basket.draft, basket.setAside, 'delivery_fee');
    const back = switchType(away.draft, away.setAside, 'basket');
    expect(back.draft).toMatchObject({ effectKind: 'percent_off', effectValue: '20' });
    expect(back.draft.rules).toEqual(named().rules);
  });

  it('se relit entière, panier minimum compris', () => {
    expect(draftOf(view)).toMatchObject({
      fulfillmentKind: 'delivery_fee',
      delivery: { on: true, all: false, ids: ['z_centre'] },
      minBasket: '49,9',
      effectKind: 'free_delivery',
    });
    expect(termsOf(draftOf(view)).conditions).toEqual([{ kind: 'min_basket', cents: 4990 }]);
  });

  it('se lit dans la liste : « Livraison offerte · dès 49,90 € HT »', () => {
    const zones = new Map([['z_centre', 'Centre']]);
    expect(spaced(summaryPhrase(view, new Map(), zones))).toBe(
      'Livraison offerte · dès 49,90 € HT · Tout le monde · Livraison · Centre',
    );
    expect(fulfillmentPhrase({ kind: 'delivery_fee', delivery: 'all' }, new Map())).toBe(
      'Livraison · toutes les zones',
    );
  });

  it('se résume pendant la saisie', () => {
    expect(spaced(draftSummary(onDelivery({ minBasket: '50' }), new Map(), new Map()))).toMatch(
      /^Livraison offerte pour tout le monde, dès 50,00 € HT, dans toutes les zones de livraison/u,
    );
    expect(draftSummary(onDelivery(), new Map(), new Map())).toContain('quel que soit le panier');
  });
});
