import type { SyncOrderTimeLimit } from "@lfd/catalog-sync";
import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import { resolveOrderTimeLimit } from "../../../order-time-limitation/domain/services/resolve-order-time-limit.js";

/** Ce qu'il faut d'une famille pour remonter son arbre. */
export interface CategoryNode {
  readonly id: string;
  readonly parentId: string | null;
}

/**
 * Ce qu'il faut d'un produit pour lui résoudre une limite — et rien de plus.
 *
 * Volontairement plus étroit que `ProductRecord`, auquel il est structurellement
 * satisfait : cette fonction ne lit ni le prix, ni les allergènes, ni les
 * canaux. Le déclarer ainsi la rend éprouvable sans fabriquer une fiche
 * complète, donc **sans le `as unknown as` qu'un doublage partiel aurait
 * exigé** — un cast dans un test coûte plus cher qu'ailleurs, c'est lui qui
 * laisse un double dériver de ce qu'il prétend jouer.
 */
export interface LimitTargetProduct {
  readonly id: string;
  readonly categoryId: string;
  readonly variants: readonly { readonly id: string }[];
}

/**
 * **La limite de commande de chaque déclinaison**, résolue une fois pour tout le
 * push.
 *
 * Résoudre ici plutôt que dans la projection garde cette dernière pure, et
 * surtout garde l'échelle du référentiel d'un seul côté du fil : la plateforme
 * reçoit des valeurs, jamais des rangs.
 *
 * Les déclinaisons **sans limite** ne sont pas dans la carte. Une entrée par
 * article dirait la même chose plus longuement, et l'immense majorité du
 * catalogue n'a aucune limite propre.
 */
export function resolveLimitsByVariant(
  products: readonly LimitTargetProduct[],
  categories: readonly CategoryNode[],
  rules: readonly OrderTimeLimitView[],
): ReadonlyMap<string, SyncOrderTimeLimit> {
  // Le raccourci qui compte : sans aucune règle, il n'y a rien à résoudre, et on
  // évite de remonter l'arbre de quatre-vingt-dix produits pour rien.
  if (rules.length === 0) {
    return new Map();
  }
  const paths = categoryPaths(categories);
  const resolved = new Map<string, SyncOrderTimeLimit>();

  for (const product of products) {
    const categoryPath = paths.get(product.categoryId) ?? [];
    for (const variant of product.variants) {
      const limit = resolveOrderTimeLimit(rules, {
        variantId: variant.id,
        productId: product.id,
        categoryPath,
      });
      if (limit !== null) {
        resolved.set(variant.id, limit);
      }
    }
  }
  return resolved;
}

/**
 * Pour chaque famille, sa **lignée** : elle-même d'abord, puis ses ancêtres
 * jusqu'à la racine.
 *
 * Elle-même en tête parce que « le plus proche gagne » commence par le rang le
 * plus précis. Calculée une fois pour toutes les familles plutôt que remontée
 * par produit : quatre-vingt-dix produits partagent une dizaine de familles, et
 * la même remontée se referait autant de fois.
 *
 * 🔴 **Un cycle ne boucle pas ici.** L'arbre des familles est censé ne pas en
 * avoir, mais « censé » n'est pas une garantie qu'on veut voir tomber sous la
 * forme d'un processus figé : la remontée s'arrête sur un identifiant déjà vu.
 * Le chemin rendu est alors tronqué — donc une règle d'ancêtre lointain peut
 * être manquée —, et c'est le bon compromis : une limite oubliée se voit, un
 * push qui ne rend jamais la main ne se voit pas.
 */
function categoryPaths(categories: readonly CategoryNode[]): ReadonlyMap<string, string[]> {
  const parents = new Map(categories.map((category) => [category.id, category.parentId]));
  const paths = new Map<string, string[]>();

  for (const category of categories) {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: string | null = category.id;
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      path.push(current);
      current = parents.get(current) ?? null;
    }
    paths.set(category.id, path);
  }
  return paths;
}
