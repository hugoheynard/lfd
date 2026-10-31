import { describe, expect, it } from 'vitest';

import type { ScopeArticle } from '../catalogue-choices';
import { draftOf, emptyDraft, termsOf, type PromotionDraft } from '../promotion-draft';
import { draftSummary } from '../promotion-summary';
import { promotionView } from '../promotion.testing';
import {
  coveredCount,
  scopeLayout,
  withApartTargets,
  withFamilyExceptions,
  withFamilyLine,
  withoutFamilyLine,
  withScopeModeLines,
} from '../scope-lines';

const ARTICLES: readonly ScopeArticle[] = [
  { sku: 'N70-1', productId: 'p_noir', familyId: 'c_choc' },
  { sku: 'N70-2', productId: 'p_noir', familyId: 'c_choc' },
  { sku: 'L-1', productId: 'p_lait', familyId: 'c_choc' },
  { sku: 'CR-1', productId: 'p_croi', familyId: 'c_vien' },
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
