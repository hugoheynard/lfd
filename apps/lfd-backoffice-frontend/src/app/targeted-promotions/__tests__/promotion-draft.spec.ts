import { describe, expect, it } from 'vitest';

import {
  draftOf,
  draftProblem,
  emptyDraft,
  termsOf,
  withFulfillment,
  withScopeMode,
  withTargets,
} from '../promotion-draft';
import { promotionView } from '../promotion.testing';

const TODAY = '2026-11-02';

describe('le brouillon de l’éditeur des promotions', () => {
  it('pose « Retrait · ce point » quand on vient de la fiche d’un site', () => {
    const draft = emptyDraft(TODAY, 'pk_coeur');
    expect(draft).toMatchObject({
      fulfillmentKind: 'pickup_point',
      pickupId: 'pk_coeur',
      audienceKind: 'everyone_but_active_pros',
    });
  });

  it('traduit les unités tapées vers les entiers du serveur', () => {
    const base = { ...emptyDraft(TODAY, null), internalName: 'Automne', labelFr: '−20 %' };
    expect(termsOf({ ...base, effectValue: '20' }).effect).toEqual({
      kind: 'percent_off',
      value: 2000,
    });
    expect(termsOf({ ...base, effectKind: 'unit_amount_off', effectValue: '0,05' }).effect).toEqual(
      {
        kind: 'unit_amount_off',
        value: 5_000,
      },
    );
    const basket = withFulfillment({ ...base, effectValue: '3' }, 'pickup');
    expect(termsOf({ ...basket, effectKind: 'basket_amount_off' }).effect).toEqual({
      kind: 'basket_amount_off',
      value: 300,
    });
  });

  it('ne juge que la forme', () => {
    const base = { ...emptyDraft(TODAY, null), internalName: 'A', labelFr: 'B' };
    expect(draftProblem(base)).toContain("valeur de l'effet");
    expect(draftProblem({ ...base, effectValue: '10', minQuantity: '2,5' })).toContain('entier');
    expect(draftProblem({ ...base, effectValue: '10' })).toBeNull();
  });

  it('changer d’acheminement ramène effet et cibles à ce que le point sait lire', () => {
    const line = withTargets(
      { ...emptyDraft(TODAY, null), effectKind: 'fixed_unit_price' },
      'variant',
      ['VIE-001-1'],
      false,
    );
    const basket = withFulfillment(line, 'pickup');
    expect(basket.effectKind).toBe('percent_off');
    expect(basket.rules).toEqual([]);
  });

  it('une famille suit le sens du mode, et le mode la retourne', () => {
    const draft = withTargets(emptyDraft(TODAY, null), 'category', ['fam-vien'], true);
    expect(draft.rules).toEqual([{ target: 'category', targetId: 'fam-vien', eligible: false }]);
    expect(withScopeMode(draft, 'only').rules[0]?.eligible).toBe(true);
  });

  it('relit une promotion existante dans les unités de l’écran', () => {
    const draft = draftOf(promotionView({ conditions: [{ kind: 'min_quantity', value: 3 }] }));
    expect(draft).toMatchObject({ effectValue: '20', minQuantity: '3', validFrom: '2026-11-01' });
    expect(termsOf(draft).scope.rules).toEqual([
      { target: 'variant', targetId: 'VIE-001-1', eligible: true },
    ]);
  });
});
