import type {
  CompanyPricingCategoryView,
  GeneralDiscountView,
  PricingItemView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  NEW_GENERAL_DISCOUNT,
  bpOfPercent,
  discountArticlesOf,
  discountBpFor,
  discountFamiliesOf,
  discountFormOf,
  discountLabel,
  discountLineRows,
  discountNames,
  discountPayload,
  discountPhrase,
  discountProblem,
  discountedArticles,
  discountedMillicents,
  flooredNames,
  sameDiscount,
  withDiscountLine,
  type GeneralDiscountForm,
} from '../general-discount';

/**
 * **La remise générale à l'écran** (`la-remise-generale.md`, « Un taux par
 * famille ») : la ligne la plus précise gagne, le prix ferme passe devant, et
 * le prix remisé est celui de la caisse.
 */

function item(
  sku: string,
  canonicalMillicents = 200_000,
  floor: number | null = null,
): PricingItemView {
  return {
    sku,
    name: `Nom ${sku}`,
    canonicalMillicents,
    ownFloor: null,
    volumeTiers: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents: canonicalMillicents,
    elasticity: null,
    negotiationRoom:
      floor === null
        ? null
        : {
            floorMillicents: floor,
            maxDiscountMillicents: canonicalMillicents - floor,
            maxDiscountBp: 0,
          },
  };
}

// Pains (racine) > Pains spéciaux ; Chocolat à part.
const CATEGORIES: CompanyPricingCategoryView[] = [
  {
    id: 'pain',
    name: 'Pains',
    family: { id: 'pain', name: 'Pains', position: 1, path: ['pain'] },
    items: [item('BAG'), item('PAV')],
  },
  {
    id: 'pain_spe',
    name: 'Pains spéciaux',
    family: {
      id: 'pain_spe',
      name: 'Pains spéciaux',
      position: 2,
      path: ['pain_spe', 'pain'],
      ancestors: [{ id: 'pain', name: 'Pains', position: 1 }],
    },
    items: [item('SEI')],
  },
  {
    id: 'choco',
    name: 'Chocolat',
    family: { id: 'choco', name: 'Chocolat', position: 3 },
    items: [item('TAB', 100_000, 90_000)],
  },
];

const ARTICLES = discountArticlesOf(CATEGORIES);

const HUGO: GeneralDiscountView = {
  mode: 'all_except',
  baseBp: 3000,
  rules: [
    { target: 'category', targetId: 'pain', bp: 4000 },
    { target: 'category', targetId: 'pain_spe', bp: 2500 },
    { target: 'category', targetId: 'choco', bp: null },
    { target: 'variant', targetId: 'BAG', bp: 3500 },
  ],
};

function bpOf(sku: string, view: GeneralDiscountView = HUGO): number | null {
  const article = ARTICLES.find((entry) => entry.sku === sku)!;
  return discountBpFor(view, article);
}

describe('la ligne la plus précise gagne', () => {
  it('déclinaison, puis famille la plus proche, puis le taux de base', () => {
    expect(bpOf('BAG')).toBe(3500);
    expect(bpOf('PAV')).toBe(4000);
    expect(bpOf('SEI')).toBe(2500);
    expect(bpOf('TAB')).toBeNull();
  });

  it('en « Seulement… », rien hors des lignes à taux', () => {
    const only: GeneralDiscountView = {
      mode: 'only',
      baseBp: null,
      rules: [{ target: 'category', targetId: 'pain', bp: 4000 }],
    };
    expect(bpOf('PAV', only)).toBe(4000);
    expect(bpOf('TAB', only)).toBeNull();
  });

  it('sans chemin de parentes, lit la famille directe', () => {
    const [article] = discountArticlesOf([
      { ...CATEGORIES[2]!, family: { id: 'choco', name: 'Chocolat', position: 3 } },
    ]);
    expect(article!.categoryPath).toEqual(['choco']);
  });
});

describe('le prix remisé', () => {
  it('est exact, arrondi une seule fois au plus proche', () => {
    expect(discountedMillicents(200_000, 3000)).toBe(140_000);
    // 123 457 × 0,7 = 86 419,9 → 86 420.
    expect(discountedMillicents(123_457, 3000)).toBe(86_420);
  });

  it('🔴 le prix ferme l’emporte : l’article n’est pas remisé', () => {
    const result = discountedArticles(HUGO, ARTICLES, new Set(['PAV']));
    expect(result.has('PAV')).toBe(false);
    expect(result.get('SEI')?.discountedMillicents).toBe(150_000);
  });

  it('Q3 : relève à la limite, et le nomme', () => {
    const view: GeneralDiscountView = { mode: 'all_except', baseBp: 3000, rules: [] };
    const result = discountedArticles(view, ARTICLES, new Set());
    expect(result.get('TAB')).toEqual({
      bp: 3000,
      discountedMillicents: 70_000,
      finalMillicents: 90_000,
      floored: true,
    });
    expect(flooredNames(result, ARTICLES)).toEqual(['Nom TAB']);
  });
});

describe('la saisie', () => {
  it('refuse un « tout sauf » sans taux de base, une ligne sans taux, un taux hors bornes', () => {
    expect(discountProblem(NEW_GENERAL_DISCOUNT)).toContain('taux de base');
    const form: GeneralDiscountForm = {
      mode: 'all_except',
      baseBp: 3000,
      lines: [{ target: 'category', targetId: 'pain', excluded: false, bp: null }],
    };
    expect(discountProblem(form)).toContain('pas de taux');
    expect(discountProblem({ ...form, baseBp: 10_000, lines: [] })).toContain('99,99');
  });

  it('refuse un « seulement » sans ligne à taux', () => {
    expect(
      discountProblem({
        mode: 'only',
        baseBp: null,
        lines: [{ target: 'category', targetId: 'choco', excluded: true, bp: null }],
      }),
    ).toContain('au moins une ligne');
  });

  it('écrit toujours le taux de base, `null` en « Seulement… », et `bp: null` pour une exclusion', () => {
    expect(
      discountPayload({
        mode: 'only',
        baseBp: 3000,
        lines: [
          { target: 'category', targetId: 'pain', excluded: false, bp: 4000 },
          { target: 'variant', targetId: 'BAG', excluded: true, bp: 1000 },
        ],
      }),
    ).toEqual({
      mode: 'only',
      baseBp: null,
      rules: [
        { target: 'category', targetId: 'pain', bp: 4000 },
        { target: 'variant', targetId: 'BAG', bp: null },
      ],
    });
  });

  it('relit la vue en saisie, aller-retour sans perte', () => {
    expect(discountPayload(discountFormOf(HUGO)!)).toEqual(HUGO);
    expect(discountFormOf(null)).toBeNull();
  });

  it('convertit les pourcents en points de base entiers', () => {
    expect(bpOfPercent(32.5)).toBe(3250);
    expect(bpOfPercent(0.07)).toBe(7);
    expect(bpOfPercent(null)).toBeNull();
  });

  it('n’ajoute pas deux fois la même cible ; une ligne neuve exclut en « tout sauf »', () => {
    const once = withDiscountLine(NEW_GENERAL_DISCOUNT, 'category', 'choco');
    expect(withDiscountLine(once, 'category', 'choco')).toBe(once);
    expect(once.lines[0]).toMatchObject({ excluded: true });
  });

  it('compare deux remises sans tenir compte de l’ordre des lignes', () => {
    expect(sameDiscount(HUGO, { ...HUGO, rules: [...HUGO.rules].reverse() })).toBe(true);
    expect(sameDiscount(HUGO, null)).toBe(false);
    expect(sameDiscount(null, null)).toBe(true);
  });
});

describe('la lecture', () => {
  const names = discountNames(CATEGORIES);

  it('liste les sous-familles et leurs parentes, parentes d’abord', () => {
    expect(discountFamiliesOf(CATEGORIES).map((family) => family.id)).toEqual([
      'pain',
      'pain_spe',
      'choco',
    ]);
  });

  it('range une sous-famille sous sa famille et compte ce que chaque ligne décide', () => {
    const rows = discountLineRows(
      discountFormOf(HUGO)!,
      discountFamiliesOf(CATEGORIES),
      ARTICLES,
      names,
    );
    expect(rows.map((row) => [row.name, row.nested, row.subtitle])).toEqual([
      ['Pains', false, 'Famille · 1 article(s)'],
      ['Nom BAG (BAG)', true, 'Article de Pains (−40 %) · 1 article(s)'],
      ['Pains spéciaux', true, 'Sous-famille de Pains (−40 %) · 1 article(s)'],
      ['Chocolat', false, 'Famille · 1 article(s)'],
    ]);
  });

  it('dit la remise en une phrase', () => {
    expect(discountPhrase(HUGO, names)).toBe(
      '−30 % sur tout le catalogue, sauf : Pains : −40 % ; Pains spéciaux : −25 % ; Chocolat : exclue ; Nom BAG (BAG) : −35 %',
    );
    expect(discountLabel(3250)).toBe('−32,5 %');
  });
});
