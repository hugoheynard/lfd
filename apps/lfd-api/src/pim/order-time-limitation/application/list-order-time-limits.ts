import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OrderTimeLimitListItem, OrderTimeLimitView } from "@lfd/pim-contracts";

import { LimitTargetLabelsReader } from "../domain/ports/limit-target-labels.reader.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";

export class ListOrderTimeLimitsQuery {}

/**
 * Les limites de **produit** et de **famille**, pour l'écran de réglages.
 * Lecture pure.
 *
 * Une ligne résiduelle d'une autre portée n'est pas montrée : elle ne
 * s'applique pas (la résolution l'ignore), et se retire encore par son
 * identifiant. Les limites archivées y sont, marquées : l'écran les montre à
 * part, avec « Restaurer ». Les exclusions d'une famille y sont nommées par le
 * SKU de leur produit, en une seule lecture pour toute la liste.
 */
@QueryHandler(ListOrderTimeLimitsQuery)
export class ListOrderTimeLimitsHandler implements IQueryHandler<
  ListOrderTimeLimitsQuery,
  readonly OrderTimeLimitListItem[]
> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    private readonly targets: LimitTargetLabelsReader,
  ) {}

  async execute(): Promise<readonly OrderTimeLimitListItem[]> {
    const rules = (await this.limits.list()).filter(isShown);
    const labels = await this.targets.labelsOf(
      rules.flatMap((rule) =>
        rule.excludedProductIds.map((scopeId) => ({ scopeType: "product", scopeId })),
      ),
    );
    return rules.map((rule) => ({
      ...rule,
      exclusions: rule.excludedProductIds.map((productId) => ({
        productId,
        label: labels.get(productId) ?? null,
      })),
    }));
  }
}

function isShown(rule: OrderTimeLimitView): boolean {
  return rule.scope.type === "product" || rule.scope.type === "category";
}
