import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { PricingProbeReport } from "@lfd/ops-contract";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ReadPricingProbeQuery } from "./read-pricing-probe.query.js";

/**
 * La sonde du calcul des prix, pour la carte de santé. **Staff only**, lecture
 * seule, comme toute la surface OPS.
 */
@Controller("admin/ops/health/pricing")
@AdminSurface("ops_health")
export class AdminPricingProbeController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(): Promise<PricingProbeReport> {
    return this.queries.execute<ReadPricingProbeQuery, PricingProbeReport>(
      new ReadPricingProbeQuery(),
    );
  }
}
