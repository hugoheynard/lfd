import type { PlannerAccessView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import { PlannerAccess } from "../../../channels/commerce/planner-access.js";
import { GetPlannerAccessQuery } from "./get-planner-access.query.js";

/**
 * **« Le planificateur est-il ouvert ici ? »** — ce que lisent le menu et la
 * garde de la boutique, dans l'espace déclaré.
 *
 * La même question que le mur, sans ses refus : le menu la pose dans tous
 * les espaces, et un 403 en perso n'y dirait rien de plus que `false`. Un
 * non-membre lit `false` sans que la clé soit consultée, comme le mur ne la
 * juge qu'après la société.
 */
@QueryHandler(GetPlannerAccessQuery)
export class GetPlannerAccessHandler implements IQueryHandler<
  GetPlannerAccessQuery,
  PlannerAccessView
> {
  constructor(
    private readonly standing: BasketBuyerStanding,
    private readonly access: PlannerAccess,
  ) {}

  async execute(query: GetPlannerAccessQuery): Promise<PlannerAccessView> {
    const companyId = query.companyId;
    if (companyId === null || !(await this.standing.isMember(query.actorUserId, companyId))) {
      return { open: false };
    }
    return { open: await this.access.isOpenFor({ companyId }) };
  }
}
