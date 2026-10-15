import {
  categoryPathOf,
  resolveOrderTimeLimit,
  type CategoryNode,
  type SyncOrderTimeLimit,
  type SyncOrderTimeLimitRule,
} from "@lfd/catalog-sync";

/** Un article en vente, réduit à ce que la descente de l'échelle lit. */
export interface OrderLimitTarget {
  readonly sku: string;
  readonly productId: string;
  /** `null` = jamais reçu par un fait : une règle de rang « déclinaison » ne le vise pas. */
  readonly variantId: string | null;
  readonly categoryId: string;
  /** La limite qu'il porte aujourd'hui. */
  readonly current: SyncOrderTimeLimit | null;
}

/** Une limite à réécrire sur un article. `null` = aucune limite ne s'applique plus. */
export interface OrderLimitChange {
  readonly sku: string;
  readonly limit: SyncOrderTimeLimit | null;
}

/**
 * **Descend l'échelle des limites de commande sur des articles** (lot 2b de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`) — pure, par
 * la même implémentation que l'ingestion du push (`snapshot-limits.ts`) et que
 * le référentiel (`@lfd/catalog-sync`) : une descente par rive finirait par
 * diverger, sur la seule règle qui refuse une commande en retard.
 *
 * Ne rend que ce qui CHANGE : une réécriture d'une valeur identique ne dirait
 * rien, et coûterait une écriture par article à chaque fait.
 */
export function orderLimitChanges(
  rules: readonly SyncOrderTimeLimitRule[],
  categories: readonly CategoryNode[],
  targets: readonly OrderLimitTarget[],
): OrderLimitChange[] {
  const pathByCategory = new Map<string, readonly string[]>();
  const pathOf = (categoryId: string): readonly string[] => {
    const cached = pathByCategory.get(categoryId) ?? categoryPathOf(categories, categoryId);
    pathByCategory.set(categoryId, cached);
    return cached;
  };
  return targets
    .map((target) => ({
      sku: target.sku,
      current: target.current,
      limit: resolveOrderTimeLimit(rules, {
        variantId: target.variantId,
        productId: target.productId,
        categoryPath: pathOf(target.categoryId),
      }),
    }))
    .filter((entry) => !sameLimit(entry.current, entry.limit))
    .map((entry) => ({ sku: entry.sku, limit: entry.limit }));
}

function sameLimit(left: SyncOrderTimeLimit | null, right: SyncOrderTimeLimit | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.daysBefore === right.daysBefore &&
    left.time === right.time &&
    left.graceMinutes === right.graceMinutes
  );
}
