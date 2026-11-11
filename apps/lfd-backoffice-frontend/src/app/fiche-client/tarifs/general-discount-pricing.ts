import type { CompanyPricingCategoryView, GeneralDiscountView } from '@lfd/contracts';
import { decidingScopeRule } from '@lfd/contracts/promotion-scope';
import { fromCents, roundToCents, scaleByBasisPoints } from '@lfd/money';

import { floorMillicentsOf } from '../../commercial/tarification/grille/mercuriale-row';

/**
 * **Ce que la remise générale fait aux prix** : le taux qui s'applique à un
 * article (la ligne la plus précise gagne — déclinaison, puis famille la plus
 * proche, puis le taux de base du mode), le prix remisé et la limite qui le
 * relève. La recherche de la ligne qui décide est celle du moteur
 * (`decidingScopeRule`, `@lfd/contracts/promotion-scope`), et le prix remisé
 * la même arithmétique exacte que la caisse (`@lfd/money`). Pur.
 */

/** Un article de la fiche tarifaire, avec ce que la remise lit. */
export interface DiscountArticle {
  readonly sku: string;
  readonly name: string;
  /** Sa famille puis ses parentes, la plus proche en tête. */
  readonly categoryPath: readonly string[];
  readonly canonicalMillicents: number;
  readonly floorMillicents: number | null;
}

/**
 * Les articles, chacun avec le chemin de sa famille. Le serveur l'émet
 * (`CatalogFamilyView.path`) ; à défaut, la famille directe seule.
 */
export function discountArticlesOf(
  categories: readonly CompanyPricingCategoryView[],
): readonly DiscountArticle[] {
  return categories.flatMap((category) =>
    category.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      categoryPath: category.family.path ?? [category.id],
      canonicalMillicents: item.canonicalMillicents,
      floorMillicents: floorMillicentsOf(item),
    })),
  );
}

/**
 * **Le taux qui s'applique à cet article**, ou `null` : exclu, ou hors d'une
 * remise « Seulement… ». La ligne la plus précise décide, sinon le mode.
 */
export function discountBpFor(
  discount: GeneralDiscountView,
  article: Pick<DiscountArticle, 'sku' | 'categoryPath'>,
): number | null {
  const decision = decidingScopeRule(discount.rules, {
    sku: article.sku,
    productId: null,
    categoryPath: article.categoryPath,
  });
  if (decision !== null) {
    return decision.rule.bp;
  }
  return discount.mode === 'all_except' ? discount.baseBp : null;
}

/** Le prix de base remisé — l'arithmétique exacte et l'arrondi unique de la caisse. */
export function discountedMillicents(canonicalMillicents: number, bp: number): number {
  return roundToCents(scaleByBasisPoints(fromCents(canonicalMillicents), bp, -1));
}

/** Ce que la remise fait à un article. */
export interface ArticleDiscount {
  readonly bp: number;
  /** Le prix remisé, avant la limite. */
  readonly discountedMillicents: number;
  /** Le prix facturé : le prix remisé, relevé par la limite s'il le faut. */
  readonly finalMillicents: number;
  readonly floored: boolean;
}

export function articleDiscount(
  discount: GeneralDiscountView,
  article: DiscountArticle,
): ArticleDiscount | null {
  const bp = discountBpFor(discount, article);
  if (bp === null) {
    return null;
  }
  const discounted = discountedMillicents(article.canonicalMillicents, bp);
  const floored = article.floorMillicents !== null && discounted < article.floorMillicents;
  return {
    bp,
    discountedMillicents: discounted,
    finalMillicents:
      floored && article.floorMillicents !== null ? article.floorMillicents : discounted,
    floored,
  };
}

/**
 * Les articles que la remise fait, par SKU : couverts **et** sans prix ferme
 * — le prix ferme l'emporte toujours (D2).
 */
export function discountedArticles(
  discount: GeneralDiscountView | null,
  articles: readonly DiscountArticle[],
  firmSkus: ReadonlySet<string>,
): ReadonlyMap<string, ArticleDiscount> {
  const result = new Map<string, ArticleDiscount>();
  if (discount === null) {
    return result;
  }
  for (const article of articles) {
    if (firmSkus.has(article.sku)) {
      continue;
    }
    const verdict = articleDiscount(discount, article);
    if (verdict !== null) {
      result.set(article.sku, verdict);
    }
  }
  return result;
}

/** Les noms des articles que la limite relèvera (Q3), dans l'ordre du catalogue. */
export function flooredNames(
  discounted: ReadonlyMap<string, ArticleDiscount>,
  articles: readonly DiscountArticle[],
): readonly string[] {
  return articles
    .filter((article) => discounted.get(article.sku)?.floored === true)
    .map((article) => article.name);
}
