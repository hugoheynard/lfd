import {
  categoryPathOf,
  resolveOrderTimeLimit,
  type OrderTimeLimitListItem,
  type OrderTimeLimitView,
} from '@lfd/pim-contracts';

import { familyDescendants, type FamilyNode, type ProductInFamily } from './family-descendants';

/**
 * Ce que devient la limite propre d'un produit face à celle de LA famille :
 *
 * - `stricter` : elle est plus stricte, c'est elle qui s'applique ;
 * - `overridden` : la famille est plus stricte, la limite du produit est sans effet ;
 * - `equal` : les deux disent la même chose ;
 * - `excluded` : le produit est exclu de la famille, sa propre limite s'applique ;
 * - `none` : la famille n'a pas de limite en vigueur, rien à comparer.
 */
export type ProductLimitStanding = 'stricter' | 'overridden' | 'equal' | 'excluded' | 'none';

/** Un produit de la descendance qui a sa propre limite, et ce qu'elle devient. */
export interface ProductLimitInFamily<P extends ProductInFamily> {
  readonly product: P;
  readonly rule: OrderTimeLimitListItem;
  readonly standing: ProductLimitStanding;
}

/** Une règle qui compte : en vigueur, avec un délai ET une heure. */
function inForce(rule: OrderTimeLimitListItem): boolean {
  return !rule.archived && rule.daysBefore !== null && rule.time !== null;
}

/**
 * Les produits de la famille (sous-familles comprises) qui ont leur propre
 * limite en vigueur, et ce qu'elle devient face à la limite de CETTE famille
 * seulement — pas des familles parentes.
 *
 * La comparaison passe par `resolveOrderTimeLimit`, la résolution que le
 * commerce applique : on résout le produit face à sa seule règle et à celle de
 * la famille, et l'on regarde qui gagne. Pas de seconde règle « plus stricte ».
 */
export function productLimitsInFamily<P extends ProductInFamily>(
  rules: readonly OrderTimeLimitListItem[],
  products: readonly P[],
  families: readonly FamilyNode[],
  familyId: string,
): readonly ProductLimitInFamily<P>[] {
  const descendants = familyDescendants(families, familyId);
  const familyRule = rules.find(
    (rule) => rule.scope.type === 'category' && rule.scope.id === familyId && inForce(rule),
  );
  const ownRules = new Map(
    rules
      .filter((rule) => rule.scope.type === 'product' && rule.scope.id !== null && inForce(rule))
      .map((rule) => [rule.scope.id, rule]),
  );
  const result: ProductLimitInFamily<P>[] = [];
  for (const product of products) {
    const rule = ownRules.get(product.id);
    if (rule !== undefined && descendants.has(product.categoryId)) {
      result.push({ product, rule, standing: standingOf(rule, familyRule, product.id, familyId) });
    }
  }
  return result;
}

function standingOf(
  own: OrderTimeLimitListItem,
  family: OrderTimeLimitListItem | undefined,
  productId: string,
  familyId: string,
): ProductLimitStanding {
  if (family === undefined) {
    return 'none';
  }
  if (family.excludedProductIds.includes(productId)) {
    return 'excluded';
  }
  return compareToFamily(own, family, productId, familyId) ?? 'none';
}

/**
 * La limite d'un produit face à celle d'UNE famille qui le vise : plus
 * stricte, sans effet ou égale. `null` si l'une des deux est incomplète.
 *
 * La comparaison passe par `resolveOrderTimeLimit`, la résolution que le
 * commerce applique : on résout le produit face aux deux seules règles et
 * l'on regarde qui gagne. Pas de seconde règle « plus stricte ».
 */
export function compareToFamily(
  own: Pick<OrderTimeLimitView, 'daysBefore' | 'time'>,
  family: OrderTimeLimitView,
  productId: string,
  familyId: string,
): 'stricter' | 'overridden' | 'equal' | null {
  if (
    own.daysBefore === null ||
    own.time === null ||
    family.daysBefore === null ||
    family.time === null
  ) {
    return null;
  }
  if (own.daysBefore === family.daysBefore && own.time === family.time) {
    return 'equal';
  }
  const ownRule = {
    scope: { type: 'product' as const, id: productId },
    daysBefore: own.daysBefore,
    time: own.time,
    graceMinutes: null,
    staffMayExceed: false,
  };
  const familyRule = { ...family, excludedProductIds: [] };
  const winner = resolveOrderTimeLimit([ownRule, familyRule], {
    variantId: null,
    productId,
    categoryPath: [familyId],
  });
  return winner?.daysBefore === own.daysBefore && winner.time === own.time
    ? 'stricter'
    : 'overridden';
}

/**
 * Une famille au-dessus de celle-ci porte-t-elle une limite en vigueur ? La
 * carte ne compare qu'à la famille ouverte ; elle le dit en une ligne.
 */
export function hasParentFamilyLimit(
  rules: readonly OrderTimeLimitListItem[],
  families: readonly FamilyNode[],
  familyId: string,
): boolean {
  const ancestors = new Set(categoryPathOf(families, familyId).slice(1));
  return rules.some(
    (rule) =>
      rule.scope.type === 'category' &&
      rule.scope.id !== null &&
      ancestors.has(rule.scope.id) &&
      inForce(rule),
  );
}
