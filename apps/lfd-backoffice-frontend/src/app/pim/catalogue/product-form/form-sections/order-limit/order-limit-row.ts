import type { OrderTimeLimitView } from '@lfd/pim-contracts';

/**
 * Retrouve la limite posée sur **ce produit**, ou `null`.
 *
 * Depuis le 2026-10-21 (décision de Hugo), une limite ne se pose que sur un
 * produit ; une ligne d'une autre portée, s'il en restait une, ne compte pas —
 * le serveur ne la sert d'ailleurs plus, et la résolution l'ignore.
 */
export function productRule(
  rules: readonly OrderTimeLimitView[],
  productId: string,
): OrderTimeLimitView | null {
  return rules.find((rule) => rule.scope.type === 'product' && rule.scope.id === productId) ?? null;
}

/**
 * La limite s'applique-t-elle ? Il faut **le délai ET l'heure** : une ligne
 * d'avant le 2026-10-21 qui n'en aurait qu'un ne refuse rien.
 */
export function limitApplies(rule: OrderTimeLimitView | null): rule is OrderTimeLimitView {
  return rule !== null && rule.daysBefore !== null && rule.time !== null;
}
