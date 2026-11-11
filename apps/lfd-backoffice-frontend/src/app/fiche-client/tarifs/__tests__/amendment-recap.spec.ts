import { describe, expect, it } from 'vitest';

import { amendmentDiff } from '../amendment-diff';
import { amendmentRecap, dearerWarning, discountChanges } from '../amendment-recap';
import { withEuros, withoutPrice } from '../draft-prices';
import { ARTICLES, edited, STATE } from './amendment-fixture';

/** **Le récapitulatif d'un avenant** : une phrase par changement, la remise, les hausses. */

describe('amendmentRecap', () => {
  it('une phrase par changement, et le prix retiré qui passe à la remise en tête', () => {
    const edit = edited((current) => ({
      ...current,
      firm: withoutPrice(withEuros(current.firm, 'CRO', 1.2), 'BAG'),
      policy: { mode: 'all', promotionIds: [] },
    }));
    const recap = amendmentRecap(amendmentDiff(STATE, edit), STATE, edit, {
      articles: ARTICLES,
      names: new Map(),
      promotions: null,
      preview: null,
      dearer: [],
    });
    expect(recap.entries).toHaveLength(3);
    expect(recap.entries[0]).toContain('Croissant : prix ferme');
    expect(recap.entries[1]).toContain('passe à la remise générale −30 %');
    expect(recap.entries[2]).toContain('Promotions');
    expect(recap.warnings.join(' ')).toContain('Baguette');
  });

  it('un refus de l’aperçu désigne la ligne', () => {
    const edit = edited((current) => ({ ...current, firm: withEuros(current.firm, 'BRI', 1.8) }));
    const recap = amendmentRecap(amendmentDiff(STATE, edit), STATE, edit, {
      articles: ARTICLES,
      names: new Map(),
      promotions: null,
      preview: {
        at: '2026-11-11T10:00:00.000Z',
        basedOnAmendmentId: null,
        state: STATE,
        items: [],
        refusals: [{ code: 'x', sku: 'BRI', message: 'Article hors vente.' }],
      },
      dearer: [],
    });
    expect(recap.warnings[0]).toBe('Article hors vente. Ligne : Brioche.');
  });
});

describe('discountChanges', () => {
  const names = new Map([
    ['pain', 'Pains'],
    ['choc', 'Chocolat'],
    ['spe', 'Pains spéciaux'],
    ['vien', 'Viennoiseries'],
  ]);

  it('ne dit que ce qui change, une puce par différence', () => {
    const changes = discountChanges(
      {
        mode: 'all_except',
        baseBp: 500,
        rules: [
          { target: 'category', targetId: 'pain', bp: 4000 },
          { target: 'category', targetId: 'choc', bp: 1000 },
          { target: 'category', targetId: 'vien', bp: 2000 },
        ],
      },
      {
        mode: 'all_except',
        baseBp: 1000,
        rules: [
          { target: 'category', targetId: 'pain', bp: 4500 },
          { target: 'category', targetId: 'choc', bp: null },
          { target: 'category', targetId: 'spe', bp: 2500 },
        ],
      },
      names,
    );
    expect(changes).toEqual([
      'Taux de base : −5 % → −10 %',
      'Pains : −40 % → −45 %',
      'Chocolat : maintenant exclue',
      'Viennoiseries : ligne retirée (suit le taux de base)',
      'Pains spéciaux : ligne ajoutée à −25 %',
    ]);
  });

  it('une ligne inchangée ne se dit pas ; une remise arrêtée tient en une puce', () => {
    const same = { mode: 'all_except' as const, baseBp: 500, rules: [] };
    expect(discountChanges(same, { ...same, rules: [] }, names)).toEqual([]);
    expect(discountChanges(same, null, names)).toEqual(['Remise générale arrêtée']);
  });

  it('le récapitulatif compte les articles sans prix ferme dont le prix change', () => {
    const edit = edited((current) => ({
      ...current,
      discount: { mode: 'all_except', baseBp: 3500, lines: [] },
    }));
    const recap = amendmentRecap(amendmentDiff(STATE, edit), STATE, edit, {
      articles: ARTICLES,
      names,
      promotions: null,
      preview: null,
      dearer: [],
    });
    expect(recap.discount).toEqual([
      'Taux de base : −30 % → −35 %',
      'Chocolat : ligne retirée (suit le taux de base)',
      'Change le prix de 2 article(s) sans prix ferme',
    ]);
  });
});

describe('dearerWarning', () => {
  it('nomme cinq articles plus chers, puis compte le reste', () => {
    const dearer = Array.from({ length: 7 }, (_, index) => ({
      name: `A${String(index)}`,
      beforeMillicents: 136_000,
      afterMillicents: 153_000,
    }));
    const warning = dearerWarning(dearer);
    expect(warning).toContain('7 article(s) seront plus chers qu’aujourd’hui');
    expect(warning).toContain('A0 (+0,17');
    expect(warning).toContain('et 2 autre(s)');
    expect(dearerWarning([])).toBeNull();
  });
});
