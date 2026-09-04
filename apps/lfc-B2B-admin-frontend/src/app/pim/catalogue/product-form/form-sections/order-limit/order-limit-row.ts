import type {
  ExplainedOrderTimeLimit,
  OrderTimeLimitScopeType,
  OrderTimeLimitView,
} from '@lfd/pim-contracts';

/** Ce qu'une ligne montre : la portée visée, ce qu'elle pose, ce qui s'applique. */
export interface OrderLimitRow {
  readonly scopeType: OrderTimeLimitScopeType;
  /** L'objet visé — l'identifiant du produit ou de la déclinaison. */
  readonly scopeId: string;
  readonly label: string;
  /** La règle posée SUR CETTE PORTÉE, ou `null` — elle hérite alors. */
  readonly rule: OrderTimeLimitView | null;
  /** Ce qui s'applique réellement, champ par champ, avec l'origine de chacun. */
  readonly effective: ExplainedOrderTimeLimit;
}

/**
 * Retrouve, parmi toutes les règles, celle posée **exactement** sur cette
 * portée.
 *
 * « Exactement » est tout le sujet : ce qu'une portée POSE et ce qui s'y
 * APPLIQUE sont deux choses, et la ligne montre les deux séparément. Les
 * confondre ferait croire qu'on modifie la règle de la famille en modifiant ici
 * — et on en poserait une seconde copie, qui ne suivrait plus.
 */
export function ownRule(
  rules: readonly OrderTimeLimitView[],
  scopeType: OrderTimeLimitScopeType,
  scopeId: string,
): OrderTimeLimitView | null {
  return rules.find((rule) => rule.scope.type === scopeType && rule.scope.id === scopeId) ?? null;
}

/**
 * Une limite ne s'applique que si **le jour ET l'heure** sont résolus.
 *
 * Le dire à l'écran, parce que le cas est contre-intuitif : une famille qui ne
 * pose qu'une heure, sans rien au-dessus pour porter le délai, ne produit
 * **aucune** limite. On croirait avoir réglé quelque chose.
 */
export function limitApplies(effective: ExplainedOrderTimeLimit): boolean {
  return effective.daysBefore !== null && effective.time !== null;
}
