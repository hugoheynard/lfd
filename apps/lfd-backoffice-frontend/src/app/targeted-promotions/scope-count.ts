import {
  promotionScopeCovers,
  type PromotionScope,
  type PromotionScopePoint,
} from '@lfd/contracts/promotion-scope';

import type { ScopeArticle } from './catalogue-choices';
import { targetsFor, type PromotionDraft } from './promotion-draft';

/**
 * **Le compte de la carte « Sur quels articles ? »** — « N concernés sur M ».
 * Pure ; le jugement d'un article est celui du moteur, par la même fonction.
 */

/** La cible des « Sauf » d'une ligne : la déclinaison au prix affiché, le produit au panier. */
export function exceptionTarget(draft: PromotionDraft): 'product' | 'variant' {
  return targetsFor(draft.fulfillmentKind).includes('variant') ? 'variant' : 'product';
}

/** La portée du brouillon, dans la forme du moteur : aucun rang forcé. */
function scopeOf(draft: PromotionDraft): PromotionScope {
  return {
    mode: draft.scopeMode,
    rules: draft.rules.map(({ target, targetId, eligible }) => ({
      target,
      targetId,
      eligible,
      targetRank: null,
    })),
  };
}

/**
 * Le point où le moteur pose la question : la ligne au prix affiché, le
 * panier sinon. Une unité inconnue (déclinaison que la plateforme ne vend
 * pas) se juge comme une unité autre que la pièce : seule une règle qui la
 * nomme l'atteint — on ne la compte pas sur la foi d'une famille.
 */
function pointOf(draft: PromotionDraft, article: ScopeArticle): PromotionScopePoint {
  return draft.fulfillmentKind === 'displayed_price'
    ? { kind: 'line', saleUnit: article.saleUnit ?? 'weight' }
    : { kind: 'basket' };
}

/**
 * **Cet article est-il concerné ?** — la règle même du moteur
 * (`@lfd/contracts/promotion-scope`, `promotionScopeCovers`) : déclinaison >
 * produit > famille la plus proche > mode, et au prix affiché, ni famille ni
 * mode n'atteignent un article au poids.
 */
export function covers(draft: PromotionDraft, article: ScopeArticle): boolean {
  const { sku, productId, categoryPath } = article;
  return promotionScopeCovers(
    scopeOf(draft),
    { sku, productId, categoryPath },
    pointOf(draft, article),
  );
}

/**
 * Les articles comptés, dans l'unité du genre — la déclinaison, ou le
 * produit, concerné dès qu'une de ses déclinaisons l'est — avec leur verdict.
 */
function countedVerdicts(
  draft: PromotionDraft,
  articles: readonly ScopeArticle[],
): { readonly article: ScopeArticle; readonly covered: boolean }[] {
  const judged = articles.map((article) => ({ article, covered: covers(draft, article) }));
  if (exceptionTarget(draft) === 'variant') {
    return judged;
  }
  const byProduct = new Map<string, { article: ScopeArticle; covered: boolean }>();
  for (const verdict of judged) {
    const seen = byProduct.get(verdict.article.productId);
    byProduct.set(verdict.article.productId, {
      article: seen?.article ?? verdict.article,
      covered: (seen?.covered ?? false) || verdict.covered,
    });
  }
  return [...byProduct.values()];
}

/** « N concernés sur M », toutes familles, ou celle d'une ligne et ses sous-familles. */
export function coveredCount(
  draft: PromotionDraft,
  articles: readonly ScopeArticle[],
  familyId: string | null = null,
): { readonly covered: number; readonly total: number } {
  const verdicts = countedVerdicts(draft, articles).filter(
    ({ article }) => familyId === null || article.categoryPath.includes(familyId),
  );
  return {
    covered: verdicts.filter((verdict) => verdict.covered).length,
    total: verdicts.length,
  };
}

/**
 * Les « Sauf » qu'une ligne peut proposer : les produits ou déclinaisons de
 * la famille et de ses sous-familles, dans l'unité du genre.
 */
export function lineChoiceIds(
  draft: PromotionDraft,
  articles: readonly ScopeArticle[],
  familyId: string,
): readonly string[] {
  const target = exceptionTarget(draft);
  return [
    ...new Set(
      articles
        .filter((article) => article.categoryPath.includes(familyId))
        .map((article) => (target === 'variant' ? article.sku : article.productId)),
    ),
  ];
}
