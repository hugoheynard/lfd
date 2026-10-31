import { describe, expect, it } from 'vitest';

import {
  draftOf,
  draftProblem,
  duplicateDraft,
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

  it('envoie « Cumulable » aux deux points, et la garde en changeant d’acheminement (§ 16, M7)', () => {
    const base = { ...emptyDraft(TODAY, null), internalName: 'A', labelFr: 'B', effectValue: '20' };
    expect(base.cumulative).toBe(false);
    expect(termsOf(base).cumulative).toBe(false);
    const cumulative = { ...base, cumulative: true };
    expect(termsOf(cumulative).cumulative).toBe(true);
    const basket = withFulfillment(cumulative, 'pickup');
    expect(basket.cumulative).toBe(true);
    expect(termsOf({ ...cumulative, fulfillmentKind: 'pickup' }).cumulative).toBe(true);
    expect(draftOf(promotionView({ cumulative: true })).cumulative).toBe(true);
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

describe('le brouillon → le corps minimal, bords', () => {
  const base = {
    ...emptyDraft(TODAY, null),
    internalName: 'A',
    labelFr: 'Commun',
    effectValue: '10',
  };

  it('une locale vidée part en `null`, jamais en chaîne vide ; l’italien seul survit', () => {
    expect(termsOf({ ...base, labelEn: '', labelIt: '' }).label).toEqual({
      fr: 'Commun',
      en: null,
      it: null,
    });
    expect(termsOf({ ...base, labelEn: '   ', labelIt: ' Solo ' }).label).toEqual({
      fr: 'Commun',
      en: null,
      it: 'Solo',
    });
  });

  it('le libellé d’une branche touchée mais laissé vide part en `null` (repli sur le commun)', () => {
    const terms = termsOf({ ...base, audiences: [{ kind: 'everyone', companyId: null }] });
    expect(terms.audienceLabels).toEqual({ individuals: null, pros: null });
  });

  it('un libellé de branche sans français est ignoré même si son italien est rempli', () => {
    const terms = termsOf({ ...base, individualsIt: 'Privati' });
    expect(terms.audienceLabels.individuals).toBeNull();
  });

  it('le libellé Pros reste envoyé quand seule une société est nommée (elle est sous Pros)', () => {
    const terms = termsOf({
      ...base,
      audiences: [{ kind: 'company', companyId: ' co_1 ' }],
      prosFr: 'Pour vous',
      individualsFr: 'Orphelin',
    });
    expect(terms.audienceLabels).toEqual({
      individuals: null,
      pros: { fr: 'Pour vous', en: null, it: null },
    });
    expect(terms.audiences).toEqual([{ kind: 'company', companyId: 'co_1' }]);
  });

  it('motif : vide ou blanc = aucun, sinon rogné', () => {
    expect(termsOf({ ...base, reason: '  ' }).reason).toBeNull();
    expect(termsOf({ ...base, reason: ' fin de série ' }).reason).toBe('fin de série');
  });

  it('fenêtre : sans fin = `null` ; sinon minuit à Paris, hiver comme été', () => {
    expect(termsOf(base).validTo).toBeNull();
    const winter = termsOf({ ...base, validFrom: '2026-12-01', validTo: '2026-12-31' });
    expect(winter.validFrom).toBe('2026-11-30T23:00:00.000Z');
    expect(winter.validTo).toBe('2026-12-30T23:00:00.000Z');
    expect(termsOf({ ...base, validFrom: '2026-07-01' }).validFrom).toBe(
      '2026-06-30T22:00:00.000Z',
    );
  });

  it('une fenêtre inversée n’est pas jugée ici : la forme passe, le serveur la refuse nommée', () => {
    const inverted = { ...base, validFrom: '2026-12-31', validTo: '2026-12-01' };
    expect(draftProblem(inverted)).toBeNull();
    const { validFrom, validTo } = termsOf(inverted);
    expect(validFrom > (validTo ?? '')).toBe(true);
  });

  it('une date de fin illisible est dite, une fin vide ne l’est pas', () => {
    expect(draftProblem({ ...base, validTo: '2026-13-45' })).toContain('fin');
    expect(draftProblem({ ...base, validTo: '' })).toBeNull();
    expect(draftProblem({ ...base, validFrom: '' })).toContain('premier jour');
  });

  it.each([
    ['20', 'percent_off', 2000],
    ['20 ', 'percent_off', 2000],
    ['12,5', 'percent_off', 1250],
    ['0,07', 'percent_off', 7],
    ['0,07', 'unit_amount_off', 7000],
    ['0,00001', 'unit_amount_off', 1],
    ['0,9', 'fixed_unit_price', 90_000],
  ] as const)('la saisie « %s » en %s vaut %d', (typed, effectKind, value) => {
    expect(termsOf({ ...base, effectKind, effectValue: typed }).effect.value).toBe(value);
  });

  it('un montant de panier au centime près ne dérive pas en flottant', () => {
    const basket = withFulfillment({ ...base, effectValue: '19,99' }, 'pickup');
    expect(termsOf({ ...basket, effectKind: 'basket_amount_off' }).effect.value).toBe(1999);
  });

  it.each(['', '  ', '-5', 'abc', '1e3', '1,2,3', '12 %'])(
    'la valeur « %s » est refusée par la forme',
    (effectValue) => {
      expect(draftProblem({ ...base, effectValue })).toContain(
        'valeur de l’effet'.replace('’', "'"),
      );
    },
  );

  it('la quantité minimum : vide = aucune condition ; un entier = une condition ; le reste est refusé', () => {
    expect(termsOf(base).conditions).toEqual([]);
    expect(termsOf({ ...base, minQuantity: ' 6 ' }).conditions).toEqual([
      { kind: 'min_quantity', value: 6 },
    ]);
    for (const minQuantity of ['abc', '-1', '2.5', '1e2']) {
      expect(draftProblem({ ...base, minQuantity })).toContain('entier');
    }
  });

  it('l’identifiant du point n’est envoyé que pour « Retrait · un point »', () => {
    const point = { ...base, pickupId: 'pk_coeur' };
    expect(termsOf({ ...point, fulfillmentKind: 'pickup_point' }).fulfillment).toEqual({
      kind: 'pickup_point',
      pickupId: 'pk_coeur',
    });
    for (const kind of ['any', 'pickup', 'delivery'] as const) {
      expect(termsOf({ ...point, fulfillmentKind: kind }).fulfillment.pickupId).toBeNull();
    }
  });

  it('« mercuriale » ne part qu’au point ligne ; « Cumulable » part aux deux points (M7)', () => {
    const checked = { ...base, stacksOverMercuriale: true, cumulative: true };
    expect(termsOf(checked)).toMatchObject({ stacksOverMercuriale: true, cumulative: true });
    for (const kind of ['pickup', 'pickup_point', 'delivery'] as const) {
      expect(termsOf({ ...checked, fulfillmentKind: kind })).toMatchObject({
        stacksOverMercuriale: false,
        cumulative: true,
      });
    }
  });

  it('une société sans identifiant (null) reste `null` dans le corps, un identifiant est rogné', () => {
    expect(termsOf({ ...base, audiences: [{ kind: 'pros', companyId: null }] }).audiences).toEqual([
      { kind: 'pros', companyId: null },
    ]);
  });

  it('le nom interne est rogné et un nom blanc est refusé, comme un libellé blanc', () => {
    expect(termsOf({ ...base, internalName: '  Nom  ' }).internalName).toBe('Nom');
    expect(draftProblem({ ...base, internalName: '   ' })).toContain('nom interne');
    expect(draftProblem({ ...base, labelFr: '  ' })).toContain('libellé');
  });
});

describe('relire puis renvoyer : l’éditeur ne change rien sans qu’on y touche', () => {
  it('aller-retour d’une promotion complète : le corps renvoyé redit ce que la vue disait', () => {
    const view = promotionView({
      label: { fr: 'Fr', en: null, it: 'Solo italiano' },
      validTo: '2026-12-31T23:00:00.000Z',
      cumulative: true,
      stacksOverMercuriale: true,
      conditions: [{ kind: 'min_quantity', value: 6 }],
      audiences: [
        { kind: 'pros', companyId: null },
        { kind: 'company', companyId: 'co_1' },
      ],
      audienceLabels: { individuals: null, pros: { fr: 'Pro', en: null, it: 'Pro IT' } },
    });
    expect(termsOf(draftOf(view))).toMatchObject({
      internalName: view.internalName,
      label: { fr: 'Fr', en: null, it: 'Solo italiano' },
      audienceLabels: { individuals: null, pros: { fr: 'Pro', en: null, it: 'Pro IT' } },
      effect: view.effect,
      cumulative: true,
      stacksOverMercuriale: true,
      validFrom: '2026-10-31T23:00:00.000Z',
      validTo: '2026-12-31T23:00:00.000Z',
      audiences: view.audiences,
      fulfillment: view.fulfillment,
      conditions: view.conditions,
    });
  });

  it('une valeur décimale se relit puis se renvoie à l’identique, au millicentime près', () => {
    for (const value of [1, 7, 12_345, 99_999, 100_001]) {
      const view = promotionView({ effect: { kind: 'unit_amount_off', value } });
      expect(termsOf(draftOf(view)).effect.value).toBe(value);
    }
  });

  it('la veille minuit-Paris et minuit-Paris sont deux jours : la borne est incluse', () => {
    expect(draftOf(promotionView({ validFrom: '2026-10-31T23:00:00.000Z' })).validFrom).toBe(
      '2026-11-01',
    );
    expect(draftOf(promotionView({ validFrom: '2026-10-31T22:59:59.999Z' })).validFrom).toBe(
      '2026-10-31',
    );
  });

  it('une locale `null` se relit en champ vide, pas en « null »', () => {
    const draft = draftOf(promotionView());
    expect([draft.labelEn, draft.labelIt, draft.reason, draft.validTo]).toEqual(['', '', '', '']);
  });

  it('une copie pour un autre public garde tout sauf le public, et marque son nom', () => {
    const original = promotionView({
      fulfillment: { kind: 'delivery', pickupId: null },
      applicationPoint: 'basket',
      cumulative: true,
      conditions: [{ kind: 'min_quantity', value: 3 }],
    });
    const copy = duplicateDraft(original);
    const { audiences: _audiences, internalName, ...rest } = copy;
    const { audiences: _kept, internalName: _name, ...same } = draftOf(original);
    expect(rest).toEqual(same);
    expect(copy.audiences).toEqual([]);
    expect(internalName).toBe(`${original.internalName} (copie à revoir)`);
    expect(draftProblem(copy)).toBe('Cochez au moins un public.');
  });
});
