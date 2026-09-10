import type { BillingCycleView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetCurrentBillingCycleQuery } from "../application/queries/billing-cycle-queries.js";

/**
 * Surface **staff** du cycle de prélèvement.
 *
 * Un contrôleur à part de celui des entités, et pas par symétrie : un cycle
 * n'est pas une entité juridique, il n'en dépend pas, et il portera bientôt des
 * gestes qui n'ont rien à voir — clôturer, rouvrir. Les loger dans le contrôleur
 * de l'entité aurait fait de celui-ci l'endroit où l'on met la comptabilité.
 */
@Controller("admin/accounting/billing-cycle")
@AdminSurface("b2b_accounting")
export class AdminBillingCycleController {
  constructor(private readonly queries: QueryBus) {}

  /** Le cycle en cours. Ne clôture rien : deux appels rendent la même fenêtre. */
  @Get("current")
  async current(): Promise<BillingCycleView> {
    return this.queries.execute<GetCurrentBillingCycleQuery, BillingCycleView>(
      new GetCurrentBillingCycleQuery(),
    );
  }
}
