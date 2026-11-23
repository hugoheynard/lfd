import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { EffectiveOrderTimeLimitView, OrderTimeLimitView } from "@lfd/pim-contracts";

import { OrderTimeLimitProductNotFoundError } from "../domain/errors/order-time-limit-errors.js";
import { LimitTargetLabelsReader } from "../domain/ports/limit-target-labels.reader.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { ProductLineageReader } from "../domain/ports/product-lineage.reader.js";
import { explainOrderTimeLimit } from "../domain/services/resolve-order-time-limit.js";

export class ExplainProductOrderTimeLimitQuery {
  constructor(readonly productId: string) {}
}

/**
 * **La limite effective d'un produit, et d'où elle vient** — pour la fiche
 * produit : les limites en vigueur posées sur lui ou sur une famille de sa
 * lignée, la lignée nommée, et la plus stricte avec sa provenance.
 *
 * La résolution est celle que le commerce applique (`@lfd/catalog-sync`) :
 * la fiche ne dit jamais une autre limite que celle que la passation juge. Une
 * famille qui exclut le produit est rendue, marquée, pour que l'écran propose
 * de le réintégrer.
 *
 * @throws {OrderTimeLimitProductNotFoundError} aucune fiche sous cet identifiant.
 */
@QueryHandler(ExplainProductOrderTimeLimitQuery)
export class ExplainProductOrderTimeLimitHandler implements IQueryHandler<
  ExplainProductOrderTimeLimitQuery,
  EffectiveOrderTimeLimitView
> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    private readonly lineage: ProductLineageReader,
    private readonly targets: LimitTargetLabelsReader,
  ) {}

  async execute(query: ExplainProductOrderTimeLimitQuery): Promise<EffectiveOrderTimeLimitView> {
    const { productId } = query;
    const categoryPath = await this.lineage.lineageOf(productId);
    if (categoryPath === null) {
      throw new OrderTimeLimitProductNotFoundError(productId);
    }
    const rules = (await this.limits.inForce()).filter((rule) =>
      concerns(rule, productId, categoryPath),
    );
    const labels = await this.targets.labelsOf(
      categoryPath.map((scopeId) => ({ scopeType: "category", scopeId })),
    );
    return {
      productId,
      lineage: categoryPath.map((id) => ({ id, label: labels.get(id) ?? null })),
      rules: rules.map((rule) => ({
        rule,
        excludesProduct: rule.excludedProductIds.includes(productId),
      })),
      explained: explainOrderTimeLimit(rules, { variantId: null, productId, categoryPath }),
    };
  }
}

/** Posée sur le produit, ou sur une famille de sa lignée. */
function concerns(
  rule: OrderTimeLimitView,
  productId: string,
  categoryPath: readonly string[],
): boolean {
  if (rule.scope.type === "product") {
    return rule.scope.id === productId;
  }
  return rule.scope.type === "category" && rule.scope.id !== null
    ? categoryPath.includes(rule.scope.id)
    : false;
}
