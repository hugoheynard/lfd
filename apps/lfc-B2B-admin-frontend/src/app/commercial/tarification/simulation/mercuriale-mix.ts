import type { PricingCategoryView, TemplateLinePayload } from '@lfd/contracts';

import { floorCentsOf } from '../grille/mercuriale-row';
import { revenueCentsAt, type ArticleBasis, type ScenarioTier } from './revenue-model';

/** Un article du plan : sa grille, sa limite, et le volume prévu dessus. */
export interface MixArticle {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly sku: string;
  readonly basis: ArticleBasis;
  /** Vide = article non tarifé : il se vend au catalogue, et compte quand même. */
  readonly tiers: readonly ScenarioTier[];
  readonly plannedVolume: number;
}

export interface MixCategory {
  readonly id: string;
  readonly name: string;
  /** Le chiffre de ce rayon à chaque fraction du plan, en centimes. */
  readonly revenueByRatio: readonly number[];
  /** Ce que le rayon aurait pesé au tarif catalogue, aux mêmes volumes. */
  readonly catalogueByRatio: readonly number[];
  /**
   * **Ce qui est lâché** : catalogue − facturé, en centimes.
   *
   * Un montant et non un taux, et c'est ce qui rend le partage traçable : des
   * pourcentages de remise ne s'additionnent pas — deux rayons à −10 % et −20 %
   * ne font pas un tout de 30 %. Des euros concédés, si.
   *
   * Peut être **négatif** : une mercuriale au-dessus du catalogue existe, et la
   * nier ici la ferait disparaître du total.
   */
  readonly concededByRatio: readonly number[];
}

export interface CategoryMix {
  /** Les fractions du plan tracées — `1` = le plan tenu. */
  readonly ratios: readonly number[];
  readonly categories: readonly MixCategory[];
  /**
   * Un palier existe-t-il quelque part ? C'est ce qui décide de la FORME : sans
   * palier, chaque prix est plat, donc la part de chaque rayon ne bouge pas avec
   * le volume — une aire empilée dessinerait des bandes parallèles et ne dirait
   * rien qu'un camembert ne dise mieux.
   */
  readonly hasTier: boolean;
  /** Le chiffre du plan tenu, en centimes. */
  readonly plannedCents: number;
  /** Ce que le plan tenu laisse au client, face au tarif catalogue. */
  readonly concededCents: number;
  readonly plannedArticles: number;
}

/** Les fractions du plan : jusqu'à un tiers au-dessus, et `1` posé exactement. */
export function planRatios(step = 0.05, overshoot = 1.3): readonly number[] {
  const ratios = new Set<number>([1]);
  for (let ratio = step; ratio <= overshoot + step / 2; ratio += step) {
    ratios.add(Math.round(ratio * 100) / 100);
  }
  return [...ratios].sort((left, right) => left - right);
}

/**
 * **La part de chaque rayon dans le chiffre de la mercuriale.**
 *
 * L'axe n'est pas un volume mais une **fraction du plan** : les articles n'ont pas
 * le même volume prévu, et les additionner sur un axe de quantités mélangerait
 * des baguettes et des croissants. Faire varier tout le plan d'un même facteur
 * pose en revanche la vraie question — « et s'il n'en prend que la moitié ? » —
 * et la pose sur tous les articles à la fois.
 *
 * Un article sans volume prévu n'entre pas dans le calcul : lui en prêter un
 * inventerait du chiffre. L'écran dit combien d'articles comptent.
 */
export function categoryMix(
  articles: readonly MixArticle[],
  ratios: readonly number[],
): CategoryMix {
  const planned = articles.filter((article) => article.plannedVolume >= 1);
  const byCategory = new Map<string, MixArticle[]>();
  for (const article of planned) {
    byCategory.set(article.categoryId, [...(byCategory.get(article.categoryId) ?? []), article]);
  }
  const categories = [...byCategory.entries()].map(([id, group]) => {
    const revenueByRatio = ratios.map((ratio) =>
      group.reduce((sum, article) => sum + revenueAtRatio(article, ratio), 0),
    );
    const catalogueByRatio = ratios.map((ratio) =>
      group.reduce((sum, article) => sum + catalogueAtRatio(article, ratio), 0),
    );
    return {
      id,
      name: group[0]?.categoryName ?? id,
      revenueByRatio,
      catalogueByRatio,
      concededByRatio: catalogueByRatio.map(
        (catalogue, index) => catalogue - (revenueByRatio[index] ?? 0),
      ),
    };
  });
  const atPlan = ratios.indexOf(1);
  return {
    ratios,
    categories,
    hasTier: planned.some((article) => article.tiers.length > 1),
    plannedCents:
      atPlan === -1
        ? 0
        : categories.reduce((sum, category) => sum + (category.revenueByRatio[atPlan] ?? 0), 0),
    concededCents:
      atPlan === -1
        ? 0
        : categories.reduce((sum, category) => sum + (category.concededByRatio[atPlan] ?? 0), 0),
    plannedArticles: planned.length,
  };
}

/**
 * Le chiffre d'un article à une fraction du plan.
 *
 * Le volume est **arrondi à l'unité** : une fraction de croissant ne se vend pas,
 * et surtout un palier se franchit à un entier — laisser 999,4 unités glisser
 * sous un seuil de 1 000 donnerait une marche décalée sur la courbe agrégée.
 */
function revenueAtRatio(article: MixArticle, ratio: number): number {
  const volume = Math.round(article.plannedVolume * ratio);
  if (volume < 1) {
    return 0;
  }
  return revenueCentsAt(
    { id: article.sku, label: article.sku, tiers: article.tiers },
    article.basis,
    volume,
  );
}

/** Ce que l'article aurait pesé au tarif catalogue, au même volume. */
function catalogueAtRatio(article: MixArticle, ratio: number): number {
  const volume = Math.round(article.plannedVolume * ratio);
  return volume < 1 ? 0 : volume * article.basis.catalogCents;
}

/** La part d'un rayon dans le total, en pourcent — pour le camembert comme pour l'aire. */
export function shareAt(
  mix: CategoryMix,
  index: number,
): readonly { name: string; cents: number }[] {
  return mix.categories.map((category) => ({
    name: category.name,
    cents: category.revenueByRatio[index] ?? 0,
  }));
}

/**
 * **Au-delà de sept rayons, le reste devient « Autres ».**
 *
 * Non par esthétique : le jeu de teintes en compte huit, et un neuvième rayon
 * reprendrait la couleur du premier. Deux rayons de la même couleur sur une aire
 * empilée ne se remarquent pas — ils se lisent comme un seul, et le total ne
 * colle plus. Fondre est le seul choix honnête ; générer une teinte de plus n'en
 * est pas un.
 */
export function foldExtras(mix: CategoryMix, max = 7): CategoryMix {
  if (mix.categories.length <= max) {
    return mix;
  }
  const atPlan = mix.ratios.indexOf(1);
  const weight = (category: MixCategory): number =>
    atPlan === -1 ? 0 : (category.revenueByRatio[atPlan] ?? 0);
  const sorted = [...mix.categories].sort((left, right) => weight(right) - weight(left));
  const kept = sorted.slice(0, max);
  const extras = sorted.slice(max);
  return {
    ...mix,
    categories: [
      ...kept,
      {
        id: 'autres',
        name: `Autres (${String(extras.length)})`,
        revenueByRatio: sumAt(extras, 'revenueByRatio', mix.ratios.length),
        catalogueByRatio: sumAt(extras, 'catalogueByRatio', mix.ratios.length),
        concededByRatio: sumAt(extras, 'concededByRatio', mix.ratios.length),
      },
    ],
  };
}

/**
 * **Le plan, assemblé depuis les trois sources de l'écran** : le catalogue (les
 * rayons, les tarifs, les limites), la grille saisie, et les volumes prévus.
 *
 * Ici plutôt que dans la page : c'est un assemblage, il se teste, et il porte une
 * décision — un article **non tarifé** entre au plan **au tarif catalogue**. Il
 * se vendra bien à ce prix-là, et l'écarter ferait sous-estimer le chiffre du
 * devis exactement sur les rayons qu'on n'a pas négociés.
 */
export function mixArticlesOf(
  categories: readonly PricingCategoryView[],
  lines: readonly TemplateLinePayload[],
  volumes: ReadonlyMap<string, number>,
): readonly MixArticle[] {
  const tiersBySku = new Map(lines.map((line) => [line.sku, line.tiers]));
  return categories.flatMap((category) =>
    category.items.map((item) => ({
      categoryId: category.id,
      categoryName: category.name,
      sku: item.sku,
      basis: {
        catalogCents: item.canonicalCents,
        floorCents: floorCentsOf(item.effectiveFloor, item.canonicalCents),
      },
      tiers: tiersBySku.get(item.sku) ?? [],
      plannedVolume: volumes.get(item.sku) ?? 0,
    })),
  );
}

/** La somme d'une des séries d'un groupe de rayons, position par position. */
function sumAt(
  categories: readonly MixCategory[],
  key: 'revenueByRatio' | 'catalogueByRatio' | 'concededByRatio',
  length: number,
): number[] {
  return Array.from({ length }, (_, index) =>
    categories.reduce((sum, category) => sum + (category[key][index] ?? 0), 0),
  );
}
