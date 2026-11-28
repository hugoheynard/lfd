import type { AdminOrderEstimateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import { OrderDrafting, PLACEMENT_POLICY } from "../services/order-drafting.service.js";
import { ShelfCircuit } from "../services/shelf-circuit.service.js";
import { StaffOrderEstimation } from "../services/staff-order-estimation.js";
import { EstimateOrderForCustomerQuery } from "./estimate-order-for-customer.query.js";

export { amountsViewOf } from "./estimate-amounts-view.js";

/**
 * **L'estimation de la saisie de l'équipe** : la commande que
 * `PlaceOrderForCustomerHandler` passerait, composée par la MÊME préparation
 * sous la MÊME politique ({@link StaffOrderEstimation}), puis lue sans être
 * écrite (plan `documentation/commandes/passation/commande-passee-par-l-equipe.md`,
 * § 8). Une requête, au sens du §4 : elle n'écrit rien.
 */
@QueryHandler(EstimateOrderForCustomerQuery)
export class EstimateOrderForCustomerHandler implements IQueryHandler<
  EstimateOrderForCustomerQuery,
  AdminOrderEstimateView
> {
  private readonly estimation: StaffOrderEstimation;

  constructor(
    guard: OrderGuardReader,
    drafting: OrderDrafting,
    shelf: ShelfCircuit,
    cutoffNotice: OrderCutoffNotice,
  ) {
    this.estimation = new StaffOrderEstimation({ guard, drafting, shelf, cutoffNotice });
  }

  execute(query: EstimateOrderForCustomerQuery): Promise<AdminOrderEstimateView> {
    return this.estimation.estimate(
      query.staffUserId,
      query.payload,
      query.exceedItemLimits,
      PLACEMENT_POLICY,
      query.chargesCounterAccounts,
    );
  }
}
