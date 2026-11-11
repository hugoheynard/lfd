import { describe, expect, it } from 'vitest';

import {
  amendmentBody,
  amendmentDiff,
  changeCount,
  defaultEffectDay,
  editOf,
  endAllowed,
  localAfter,
  NO_END_REASON,
  previewBody,
  rowLabel,
  type AmendmentEdit,
  type AmendmentState,
} from '../amendment-diff';
import { amendmentRecap, dearerWarning, discountChanges } from '../amendment-recap';
import type { DiscountArticle } from '../general-discount';
import { withEuros, withoutPrice } from '../draft-prices';
import { NO_PROMOTION_POLICY } from '../promotion-policy';

/**
 * **L'écart d'un avenant** (`l-avenant-date.md`, § 8.1) : chaque
 * ligne du tableau, la remise comparée par valeur, et l'avenant vide.
 */

const TODAY = '2026-11-11';
const DATING = {
  fromDay: '',
  toDay: '',
  reason: 'Renégociation',
  today: TODAY,
  basedOnAmendmentId: 'am_1',
};

const STATE: AmendmentState = {
  firm: [
    { sku: 'CRO', tiers: [{ minQuantity: 1, unitPriceMillicents: 130_000 }] },
    { sku: 'BAG', tiers: [{ minQuantity: 1, unitPriceMillicents: 100_000 }] },
    {
      sku: 'PAL',
      tiers: [
        { minQuantity: 1, unitPriceMillicents: 300_000 },
        { minQuantity: 10, unitPriceMillicents: 250_000 },
      ],
    },
  ],
  generalDiscount: {
    mode: 'all_except',
    baseBp: 3000,
    rules: [{ target: 'category', targetId: 'choc', bp: null }],
  },
  promotionPolicy: NO_PROMOTION_POLICY,
};

const ARTICLES: readonly DiscountArticle[] = [
  {
    sku: 'CRO',
    name: 'Croissant',
    categoryPath: ['vien'],
    canonicalMillicents: 150_000,
    floorMillicents: 120_000,
  },
  {
    sku: 'BAG',
    name: 'Baguette',
    categoryPath: ['pain'],
    canonicalMillicents: 120_000,
    floorMillicents: null,
  },
  {
    sku: 'PAL',
    name: 'Pain long',
    categoryPath: ['pain'],
    canonicalMillicents: 350_000,
    floorMillicents: null,
  },
  {
    sku: 'CHO',
    name: 'Chocolat',
    categoryPath: ['choc'],
    canonicalMillicents: 200_000,
    floorMillicents: null,
  },
  {
    sku: 'BRI',
    name: 'Brioche',
    categoryPath: ['vien'],
    canonicalMillicents: 200_000,
    floorMillicents: null,
  },
];

function edited(change: (edit: AmendmentEdit) => AmendmentEdit): AmendmentEdit {
  return change(editOf(STATE));
}

function article(sku: string): DiscountArticle {
  const found = ARTICLES.find((entry) => entry.sku === sku);
  if (found === undefined) {
    throw new Error(sku);
  }
  return found;
}

describe('amendmentDiff', () => {
  it('pré-remplit la table avec l’état : rien ne change, et l’avenant est refusé', () => {
    const diff = amendmentDiff(STATE, editOf(STATE));
    expect(changeCount(diff)).toBe(0);
    expect(amendmentBody(diff, DATING)).toEqual({
      ok: false,
      refusal: 'L’avenant ne change rien.',
    });
  });

  it('article sans prix ferme → prix tapé : une ligne ouverte', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, firm: withEuros(edit.firm, 'BRI', 1.8) })),
    );
    expect(diff.lines).toEqual([{ sku: 'BRI', unitPriceMillicents: 180_000 }]);
    expect(diff.endedSkus).toEqual([]);
  });

  it('prix ferme → autre prix : arrêté ET rouvert dans le même avenant', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, firm: withEuros(edit.firm, 'CRO', 1.2) })),
    );
    expect(diff.endedSkus).toEqual(['CRO']);
    expect(diff.lines).toEqual([{ sku: 'CRO', unitPriceMillicents: 120_000 }]);
  });

  it('prix ferme → vidé : arrêté seulement', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, firm: withoutPrice(edit.firm, 'BAG') })),
    );
    expect(diff.endedSkus).toEqual(['BAG']);
    expect(diff.lines).toEqual([]);
  });

  it('une ligne à paliers ne se réécrit pas : elle se retire', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, removedTiered: new Set(['PAL']) })),
    );
    expect(diff.endedSkus).toEqual(['PAL']);
    expect(diff.firm.get('PAL')).toEqual({ kind: 'removed', before: null });
  });

  it('la remise se compare par valeur : mêmes lignes, autre objet, aucun changement', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({
        ...edit,
        discount: {
          mode: 'all_except',
          baseBp: 3000,
          lines: [{ target: 'category', targetId: 'choc', excluded: true, bp: null }],
        },
      })),
    );
    expect(diff.generalDiscount).toBeNull();
  });

  it('remise différente : `{ set: saisie }` ; retirée : `{ set: null }`', () => {
    const changed = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, discount: { mode: 'all_except', baseBp: 3500, lines: [] } })),
    );
    expect(changed.generalDiscount).toEqual({
      set: { mode: 'all_except', baseBp: 3500, rules: [] },
    });
    const removed = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, discount: null })),
    );
    expect(removed.generalDiscount).toEqual({ set: null });
  });

  it('une remise incomplète ne part pas, et le dit', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, discount: { mode: 'all_except', baseBp: null, lines: [] } })),
    );
    expect(diff.generalDiscount).toBeNull();
    expect(amendmentBody(diff, DATING)).toMatchObject({ ok: false });
  });

  it('politique différente : elle part, et interdit une fin (F1)', () => {
    const diff = amendmentDiff(
      STATE,
      edited((edit) => ({ ...edit, policy: { mode: 'all', promotionIds: [] } })),
    );
    expect(diff.promotionPolicy).toEqual({ mode: 'all', promotionIds: [] });
    expect(endAllowed(diff)).toBe(false);
    expect(amendmentBody(diff, { ...DATING, toDay: '2026-12-01' })).toEqual({
      ok: false,
      refusal: NO_END_REASON,
    });
  });
});

describe('amendmentBody', () => {
  const diff = amendmentDiff(
    STATE,
    edited((edit) => ({ ...edit, firm: withEuros(edit.firm, 'BRI', 1.8) })),
  );

  it('« maintenant » : `validFrom` absent, aujourd’hui compris ; le dernier avenant vu part', () => {
    const body = amendmentBody(diff, { ...DATING, fromDay: TODAY });
    expect(body.ok).toBe(true);
    expect(body.ok && 'validFrom' in body.payload).toBe(false);
    expect(body.ok && body.payload.basedOnAmendmentId).toBe('am_1');
  });

  it('une date future part à minuit à Paris, avec une fin quand F1 la permet', () => {
    const body = amendmentBody(diff, { ...DATING, fromDay: '2026-12-01', toDay: '2027-01-01' });
    expect(body).toMatchObject({
      ok: true,
      payload: { validFrom: '2026-11-30T23:00:00.000Z', validTo: '2026-12-31T23:00:00.000Z' },
    });
  });

  it('refuse une date passée, une fin avant le début et un motif vide', () => {
    expect(amendmentBody(diff, { ...DATING, fromDay: '2026-11-10' }).ok).toBe(false);
    expect(amendmentBody(diff, { ...DATING, fromDay: '2026-12-01', toDay: '2026-12-01' }).ok).toBe(
      false,
    );
    expect(amendmentBody(diff, { ...DATING, reason: '  ' }).ok).toBe(false);
  });

  it('le corps de l’aperçu ne porte ni fin ni motif réel', () => {
    expect(previewBody(diff, '', TODAY)).toMatchObject({ validTo: null, lines: [{ sku: 'BRI' }] });
  });
});

describe('rowLabel et localAfter', () => {
  it('nomme chaque changement', () => {
    const edit = edited((current) => ({
      ...current,
      firm: withEuros(withoutPrice(withEuros(current.firm, 'CRO', 1.2), 'BAG'), 'BRI', 1.8),
    }));
    const diff = amendmentDiff(STATE, edit);
    expect(rowLabel(article('CRO'), STATE, edit, diff)?.label).toBe('prix changé');
    expect(rowLabel(article('BRI'), STATE, edit, diff)?.label).toBe('prix ajouté');
    // Q1 : un prix retiré que la remise couvre la suit.
    expect(rowLabel(article('BAG'), STATE, edit, diff)?.label).toBe('suit la remise');
    expect(rowLabel(article('PAL'), STATE, edit, diff)).toEqual({
      label: 'à paliers',
      changed: false,
    });
    expect(rowLabel(article('CHO'), STATE, edit, diff)).toBeNull();
  });

  it('la remise qui change se dit sur les articles sans prix ferme', () => {
    const edit = edited((current) => ({
      ...current,
      discount: { mode: 'all_except', baseBp: 3500, lines: [] },
    }));
    const diff = amendmentDiff(STATE, edit);
    expect(rowLabel(article('CHO'), STATE, edit, diff)?.label).toBe('passe à −35 %');
    const stop = edited((current) => ({
      ...current,
      discount: null,
      firm: withoutPrice(current.firm, 'BAG'),
    }));
    const stopDiff = amendmentDiff(STATE, stop);
    expect(rowLabel(article('BRI'), STATE, stop, stopDiff)?.label).toBe('sort de la remise');
    expect(rowLabel(article('BAG'), STATE, stop, stopDiff)?.label).toBe('prix retiré');
  });

  it('calcule « Après » pour un prix de la mercuriale, relevé à la limite ; rien pour la chaîne', () => {
    const edit = edited((current) => ({ ...current, firm: withEuros(current.firm, 'CRO', 1) }));
    expect(localAfter(article('CRO'), edit, STATE.generalDiscount)).toEqual({
      millicents: 120_000,
      floored: true,
    });
    expect(localAfter(article('BRI'), edit, STATE.generalDiscount)).toEqual({
      millicents: 140_000,
      floored: false,
    });
    expect(localAfter(article('CHO'), edit, STATE.generalDiscount)).toBeNull();
  });
});

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

describe('defaultEffectDay', () => {
  it('le plus tard entre aujourd’hui et le premier jour de la mercuriale (à Paris)', () => {
    expect(defaultEffectDay('2027-11-09T23:00:00.000Z', TODAY)).toBe('2027-11-10');
    expect(defaultEffectDay('2026-01-01T00:00:00.000Z', TODAY)).toBe(TODAY);
  });

  it('une date future part en `validFrom` ; aujourd’hui reste absent', () => {
    const diff = amendmentDiff(STATE, editOf(STATE));
    expect(previewBody(diff, '2027-11-10', TODAY)).toMatchObject({
      validFrom: '2027-11-09T23:00:00.000Z',
    });
    expect(previewBody(diff, TODAY, TODAY)).not.toHaveProperty('validFrom');
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
