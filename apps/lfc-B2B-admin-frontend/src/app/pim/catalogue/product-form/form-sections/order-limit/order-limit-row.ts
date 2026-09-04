import type { OrderTimeLimitScopeType, OrderTimeLimitView } from '@lfd/pim-contracts';

/** Ce qu'une ligne de l'encart montre : la portée, et ce qu'elle pose. */
export interface OrderLimitRow {
  readonly scopeType: OrderTimeLimitScopeType;
  /** L'objet visé — l'identifiant du produit ou de la déclinaison. */
  readonly scopeId: string;
  readonly label: string;
  /** La règle posée SUR CETTE PORTÉE, ou `null` — elle hérite alors. */
  readonly rule: OrderTimeLimitView | null;
}

/**
 * Retrouve, parmi toutes les règles, celle posée **exactement** sur cette
 * portée.
 *
 * « Exactement » est tout le sujet : une fiche ne montre que ce qu'ELLE pose,
 * jamais ce dont elle hérite. Afficher la règle de la famille sur la ligne du
 * produit ferait croire qu'on la modifie en modifiant ici — et on en poserait
 * une seconde, sur le produit, sans s'en rendre compte.
 */
export function ownRule(
  rules: readonly OrderTimeLimitView[],
  scopeType: OrderTimeLimitScopeType,
  scopeId: string,
): OrderTimeLimitView | null {
  return rules.find((rule) => rule.scope.type === scopeType && rule.scope.id === scopeId) ?? null;
}
