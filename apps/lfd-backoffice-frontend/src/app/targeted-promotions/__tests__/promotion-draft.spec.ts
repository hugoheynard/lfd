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
      // L8b : « tous sauf les pros actifs » dit dans les mots de l'arbre.
      audiences: [
        { kind: 'individuals', companyId: null },
        { kind: 'pros_pending', companyId: null },
      ],
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

  it('envoie le public et les libellés des seules branches touchées (L8b)', () => {
    const draft = {
      ...emptyDraft(TODAY, null),
      internalName: 'A',
      labelFr: 'Commun',
      effectValue: '10',
      audiences: [{ kind: 'individuals_registered' as const, companyId: null }],
      individualsFr: 'Inscrits',
      prosFr: 'Pros oubliés',
    };
    expect(termsOf(draft)).toMatchObject({
      audiences: [{ kind: 'individuals_registered', companyId: null }],
      audienceLabels: { individuals: { fr: 'Inscrits', en: null, it: null }, pros: null },
    });
  });

  it('refuse un public vide et une société sans identifiant', () => {
    const base = { ...emptyDraft(TODAY, null), internalName: 'A', labelFr: 'B', effectValue: '1' };
    expect(draftProblem({ ...base, audiences: [] })).toContain('au moins un public');
    expect(draftProblem({ ...base, audiences: [{ kind: 'company', companyId: ' ' }] })).toContain(
      'société',
    );
  });

  it('relit le public et les libellés d’une promotion', () => {
    const draft = draftOf(
      promotionView({
        audiences: [
          { kind: 'individuals_registered', companyId: null },
          { kind: 'pros', companyId: null },
        ],
        audienceLabels: { individuals: null, pros: { fr: 'Pro', en: 'Pro EN', it: null } },
      }),
    );
    expect(draft).toMatchObject({ prosFr: 'Pro', prosEn: 'Pro EN', prosIt: '', individualsFr: '' });
    expect(draft.audiences).toHaveLength(2);
  });
});
