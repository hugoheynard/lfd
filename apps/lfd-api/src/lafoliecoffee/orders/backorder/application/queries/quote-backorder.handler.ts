import type { AdminOrderEstimateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderCutoffNotice } from "../../../application/services/order-cutoff-notice.service.js";
import { OrderDrafting } from "../../../application/services/order-drafting.service.js";
import { ShelfCircuit } from "../../../application/services/shelf-circuit.service.js";
import { StaffOrderEstimation } from "../../../application/services/staff-order-estimation.js";
import { OrderGuardReader } from "../../../domain/ports/order-guard.reader.js";
import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import { BackorderReplayReader } from "../../domain/ports/backorder-replay.reader.js";
import { backorderEntryOf, backorderPricingOf, loadBackorder } from "../backorder-placement.js";
import { QuoteBackorderQuery } from "./quote-backorder.query.js";

/**
 * **L'estimation de la transformation d'un reliquat** : la saisie garnie du
 * reliquat, composée par {@link StaffOrderEstimation} sous la politique que la
 * transformation applique — et non par `OrderQuoting`, qui lève la surtaxe
 * par un autre chemin. Elle n'écrit rien : ni verrou, ni dérogation consommée.
 */
@QueryHandler(QuoteBackorderQuery)
export class QuoteBackorderHandler implements IQueryHandler<
  QuoteBackorderQuery,
  AdminOrderEstimateView
> {
  private readonly estimation: StaffOrderEstimation;

  constructor(
    guard: OrderGuardReader,
    drafting: OrderDrafting,
    shelf: ShelfCircuit,
    cutoffNotice: OrderCutoffNotice,
    private readonly backorders: BackorderRepository,
    private readonly replays: BackorderReplayReader,
  ) {
    this.estimation = new StaffOrderEstimation({ guard, drafting, shelf, cutoffNotice });
  }

  /**
   * @throws {BackorderNotFoundError} reliquat inconnu.
   * @throws {ParticularBackorderNotConvertibleError} reliquat de particulier : son estimation prend le corps du particulier.
   * @throws {BackorderClosedError} déjà transformé ou abandonné.
   */
  async execute(query: QuoteBackorderQuery): Promise<AdminOrderEstimateView> {
    const { backorder, companyId } = await loadBackorder(this.backorders, query.backorderId);
    const { policy } = await backorderPricingOf(this.replays, backorder);
    return this.estimation.estimate(
      query.staffUserId,
      backorderEntryOf(backorder, companyId, query.payload),
      query.exceedItemLimits,
      policy,
    );
  }
}
