import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";

export class ListOrderTimeLimitsQuery {}

/**
 * Les limites de **produit**, pour l'écran de réglages. Lecture pure.
 *
 * Depuis le 2026-10-21, seul le produit porte une limite au référentiel ; une
 * ligne résiduelle d'une autre portée n'est plus montrée, parce qu'elle ne
 * s'applique plus (la résolution l'ignore). Elle se retire encore par son
 * identifiant.
 */
@QueryHandler(ListOrderTimeLimitsQuery)
export class ListOrderTimeLimitsHandler implements IQueryHandler<
  ListOrderTimeLimitsQuery,
  readonly OrderTimeLimitView[]
> {
  constructor(private readonly limits: OrderTimeLimitRepository) {}

  async execute(): Promise<readonly OrderTimeLimitView[]> {
    return (await this.limits.list()).filter((rule) => rule.scope.type === "product");
  }
}
