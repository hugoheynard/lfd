import type { SyncOrderTimeLimit } from "@lfd/catalog-sync";
import { categoryPathOf, type CategoryNode, type OrderTimeLimitView } from "@lfd/pim-contracts";

import { resolveOrderTimeLimit } from "../../../order-time-limitation/domain/services/resolve-order-time-limit.js";

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
  const resolved = new Map<string, SyncOrderTimeLimit>();

  for (const product of products) {
    const categoryPath = categoryPathOf(categories, product.categoryId);
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
