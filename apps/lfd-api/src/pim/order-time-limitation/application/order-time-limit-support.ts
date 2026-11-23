import { OrderTimeLimitNotFoundError } from "../domain/errors/order-time-limit-errors.js";
import type { OrderTimeLimit } from "../domain/entities/order-time-limit.js";
import type { LimitScopeNamer } from "../domain/ports/limit-scope.namer.js";
import type { LimitTargetLabelsReader } from "../domain/ports/limit-target-labels.reader.js";
import type { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { limitScopeLabel } from "../domain/services/limit-scope-label.js";

/** La limite visée, archivée ou non. @throws {OrderTimeLimitNotFoundError} */
export async function requireLimit(
  limits: OrderTimeLimitRepository,
  id: string,
): Promise<OrderTimeLimit> {
  const limit = await limits.findById(id);
  if (limit === null) {
    throw new OrderTimeLimitNotFoundError(id);
  }
  return limit;
}

/**
 * Ce que la règle disait, versé au journal — la charge de `order_time_limit.set` :
 * les faits d'une même limite se relisent ensemble quand un client conteste,
 * et deux formes obligeraient à les traduire. La portée en mots est figée.
 */
export async function limitFactPayload(
  limit: OrderTimeLimit,
  scopes: LimitScopeNamer,
): Promise<Record<string, unknown>> {
  return {
    subjectLabel: limitScopeLabel(limit.scope, await scopes.nameOf(limit.scope)),
    scope: limit.scope.key,
    daysBefore: limit.daysBefore,
    time: limit.time,
    graceMinutes: limit.graceMinutes,
    staffMayExceed: limit.staffMayExceed,
  };
}

/**
 * La charge d'une exclusion ou d'une réintégration : la famille de la limite en
 * mots, et le produit nommé par son SKU du moment — par son seul identifiant
 * quand la fiche ne se nomme plus, jamais par un nom inventé.
 */
export async function exclusionFactPayload(
  limit: OrderTimeLimit,
  productId: string,
  scopes: LimitScopeNamer,
  targets: LimitTargetLabelsReader,
): Promise<Record<string, unknown>> {
  const labels = await targets.labelsOf([{ scopeType: "product", scopeId: productId }]);
  const name = labels.get(productId);
  return {
    subjectLabel: limitScopeLabel(limit.scope, await scopes.nameOf(limit.scope)),
    scope: limit.scope.key,
    product: name === undefined ? productId : { id: productId, name },
  };
}
