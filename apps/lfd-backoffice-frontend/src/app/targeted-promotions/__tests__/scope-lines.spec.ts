import { describe, expect, it } from 'vitest';

import type { ScopeArticle } from '../catalogue-choices';
import { draftOf, emptyDraft, termsOf, type PromotionDraft } from '../promotion-draft';
import { draftSummary } from '../promotion-summary';
import { promotionView } from '../promotion.testing';
import {
  coveredCount,
  lineChoiceIds,
  scopeLayout,
  withApartTargets,
  withFamilyExceptions,
  withFamilyLine,
  withoutFamilyLine,
  withScopeModeLines,
} from '../scope-lines';

const article = (
  sku: string,
  productId: string,
  categoryPath: readonly [string, ...string[]],
  saleUnit: ScopeArticle['saleUnit'] = 'piece',
): ScopeArticle => ({ sku, productId, familyId: categoryPath[0], categoryPath, saleUnit });

const ARTICLES: readonly ScopeArticle[] = [
  article('N70-1', 'p_noir', ['c_choc']),
  article('N70-2', 'p_noir', ['c_choc']),
  article('L-1', 'p_lait', ['c_choc']),
  article('CR-1', 'p_croi', ['c_vien']),
];
const NAMES = new Map([
  ['c_choc', 'Chocolaterie'],
  ['c_vien', 'Viennoiserie'],
  ['N70-1', 'Noir 70 %'],
]);

/** Au prix affiché : familles et déclinaisons. */
const atLine = (): PromotionDraft => emptyDraft('2026-11-02', null);

describe('la portée rangée par famille', () => {
  it('réintégrer une déclinaison d’une famille exclue pose une règle d’eligible inverse', () => {
    const draft = withFamilyExceptions(
      withFamilyLine(atLine(), 'c_choc'),
      'c_choc',
      ['N70-1'],
      ARTICLES,
    );
    expect(draft.rules).toEqual([
      { target: 'category', targetId: 'c_choc', eligible: false },
      { target: 'variant', targetId: 'N70-1', eligible: true },
    ]);
    expect(scopeLayout(draft, ARTICLES).lines).toEqual([
      { familyId: 'c_choc', eligible: false, exceptionIds: ['N70-1'] },
    ]);
    expect(scopeLayout(draft, ARTICLES).apart).toEqual([]);
  });

  it('en « seulement », le « Sauf » retire : eligible false sous une famille incluse', () => {
    const only = withScopeModeLines(atLine(), 'only', ARTICLES);
    const draft = withFamilyExceptions(withFamilyLine(only, 'c_choc'), 'c_choc', ['L-1'], ARTICLES);
    expect(draft.rules).toContainEqual({ target: 'variant', targetId: 'L-1', eligible: false });
  });

  it('compte avec la règle du moteur : la plus précise l’emporte', () => {
    const draft = withFamilyExceptions(
      withFamilyLine(atLine(), 'c_choc'),
      'c_choc',
      ['N70-1'],
      ARTICLES,
    );
    // CR-1 (mode) + N70-1 (réintégrée) ; N70-2 et L-1 exclues par leur famille.
    expect(coveredCount(draft, ARTICLES)).toEqual({ covered: 2, total: 4 });
    expect(coveredCount(draft, ARTICLES, 'c_choc')).toEqual({ covered: 1, total: 3 });
  });

  it('au panier, l’unité comptée est le produit', () => {
    const basket = { ...emptyDraft('2026-11-02', 'pk'), rules: [] };
    const draft = withFamilyExceptions(
      withFamilyLine(basket, 'c_choc'),
      'c_choc',
      ['p_noir'],
      ARTICLES,
    );
    expect(draft.rules).toContainEqual({ target: 'product', targetId: 'p_noir', eligible: true });
    expect(coveredCount(draft, ARTICLES)).toEqual({ covered: 2, total: 3 });
  });

  it('le résumé nomme la famille avec ses « hors »', () => {
    const draft = withFamilyExceptions(
      withFamilyLine(atLine(), 'c_choc'),
      'c_choc',
      ['N70-1'],
      ARTICLES,
    );
    expect(draftSummary(draft, NAMES, new Map(), new Map(), ARTICLES)).toContain(
      'sur tout sauf Chocolaterie (hors Noir 70 %)',
    );
  });

  it('retirer une ligne emporte ses « Sauf », pas les règles à part', () => {
    const lined = withFamilyExceptions(
      withFamilyLine(atLine(), 'c_choc'),
      'c_choc',
      ['N70-1'],
      ARTICLES,
    );
    const draft = withApartTargets(lined, 'variant', false, ['CR-1'], ARTICLES);
    expect(withoutFamilyLine(draft, 'c_choc', ARTICLES).rules).toEqual([
      { target: 'variant', targetId: 'CR-1', eligible: false },
    ]);
  });

  it('changer de mode retourne la famille ET ses « Sauf »', () => {
    const draft = withFamilyExceptions(
      withFamilyLine(atLine(), 'c_choc'),
      'c_choc',
      ['N70-1'],
      ARTICLES,
    );
    expect(withScopeModeLines(draft, 'only', ARTICLES).rules).toEqual([
      { target: 'category', targetId: 'c_choc', eligible: true },
      { target: 'variant', targetId: 'N70-1', eligible: false },
    ]);
  });

  it('aller-retour sans perte : une portée hors des lignes repart à l’identique', () => {
    const rules = [
      // Famille parente ET sous-famille, à contre-sens l'une de l'autre.
      { target: 'category' as const, targetId: 'c_parent', eligible: false, name: null },
      { target: 'category' as const, targetId: 'c_choc', eligible: true, name: null },
      // Une déclinaison hors du catalogue, et une redondante avec sa famille.
      { target: 'variant' as const, targetId: 'GONE-1', eligible: true, name: 'Disparu' },
      { target: 'variant' as const, targetId: 'L-1', eligible: false, name: null },
    ];
    const view = promotionView({ scope: { mode: 'all_except', rules } });
    const draft = draftOf(view);
    const layout = scopeLayout(draft, ARTICLES);
    expect(layout.lines.map((line) => line.familyId)).toEqual(['c_parent']);
    expect(layout.counterFamilies.map((rule) => rule.targetId)).toEqual(['c_choc']);
    expect(layout.apart.map((rule) => rule.targetId)).toEqual(['GONE-1', 'L-1']);
    // Un geste ailleurs (une ligne qu'on ajoute puis retire) ne touche rien d'autre.
    const touched = withoutFamilyLine(withFamilyLine(draft, 'c_vien'), 'c_vien', ARTICLES);
    expect(termsOf(touched).scope).toEqual(termsOf(draft).scope);
    expect(termsOf(draft).scope.rules).toEqual(
      rules.map(({ target, targetId, eligible }) => ({ target, targetId, eligible })),
    );
  });
});

/** Une famille parente (`c_epicerie` ⊃ `c_choc`) et un article au poids. */
const TREE: readonly ScopeArticle[] = [
  article('N70-1', 'p_noir', ['c_choc', 'c_epicerie']),
  article('L-1', 'p_lait', ['c_choc', 'c_epicerie']),
  article('MIEL-1', 'p_miel', ['c_epicerie']),
  article('COMTE-KG', 'p_comte', ['c_cremerie'], 'weight'),
  article('CR-1', 'p_croi', ['c_vien']),
];

describe('le compte suit la règle du moteur', () => {
  it('une famille parente couvre les articles de ses sous-familles', () => {
    const only = withScopeModeLines(atLine(), 'only', TREE);
    const draft = withFamilyLine(only, 'c_epicerie');
    expect(coveredCount(draft, TREE)).toEqual({ covered: 3, total: 5 });
    expect(coveredCount(draft, TREE, 'c_epicerie')).toEqual({ covered: 3, total: 3 });
  });

  it('un « Sauf » sous une sous-famille se range dans la ligne de la parente', () => {
    const draft = withFamilyExceptions(
      withFamilyLine(atLine(), 'c_epicerie'),
      'c_epicerie',
      ['N70-1'],
      TREE,
    );
    const layout = scopeLayout(draft, TREE);
    expect(layout.lines).toEqual([
      { familyId: 'c_epicerie', eligible: false, exceptionIds: ['N70-1'] },
    ]);
    expect(layout.apart).toEqual([]);
  });

  it('au prix affiché, le mode n’atteint pas un article au poids — sa déclinaison, si', () => {
    // « tout sauf rien » : quatre articles à la pièce, pas le comté au poids.
    expect(coveredCount(atLine(), TREE)).toEqual({ covered: 4, total: 5 });
    const named = withApartTargets(atLine(), 'variant', true, ['COMTE-KG'], TREE);
    expect(coveredCount(named, TREE)).toEqual({ covered: 5, total: 5 });
  });

  it('au panier, l’unité de vente ne joue pas', () => {
    const basket = { ...emptyDraft('2026-11-02', 'pk'), rules: [] };
    expect(coveredCount(basket, TREE)).toEqual({ covered: 5, total: 5 });
  });

  it('une déclinaison non vendue (unité inconnue) n’est pas comptée sur la foi du mode', () => {
    const unknown = [article('NEW-1', 'p_new', ['c_vien'], null)];
    expect(coveredCount(atLine(), unknown)).toEqual({ covered: 0, total: 1 });
  });

  it('les « Sauf » proposés par une ligne parente viennent aussi des sous-familles', () => {
    expect(lineChoiceIds(atLine(), TREE, 'c_epicerie')).toEqual(['N70-1', 'L-1', 'MIEL-1']);
  });
});
