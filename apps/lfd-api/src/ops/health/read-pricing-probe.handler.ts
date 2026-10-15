import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PricingProbeReport } from "@lfd/ops-contract";

import { TimingWindowReader } from "../../platform/metrics/timing-window.reader.js";
import { Clock } from "../../platform/time/clock.js";
import {
  PRICING_P95_THRESHOLD_MS,
  PRICING_RESOLVE_TIMING,
  pricingProbeRows,
} from "./pricing-probe.js";
import { ReadPricingProbeQuery } from "./read-pricing-probe.query.js";

/**
 * Lit la fenêtre, puis la juge. Le jugement est dans `pricingProbeRows`, pur ;
 * ici il n'y a que la collecte.
 *
 * Une route à part de `/admin/ops/health` : un calcul lent n'est pas une
 * panne, et la carte des nœuds ne doit pas attendre ce qui n'en est pas une.
 */
@QueryHandler(ReadPricingProbeQuery)
export class ReadPricingProbeHandler implements IQueryHandler<
  ReadPricingProbeQuery,
  PricingProbeReport
> {
  constructor(
    private readonly timings: TimingWindowReader,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<PricingProbeReport> {
    return Promise.resolve({
      generatedAt: this.clock.now().toISOString(),
      windowMinutes: this.timings.windowMinutes,
      p95ThresholdMs: PRICING_P95_THRESHOLD_MS,
      perInstance: true,
      rows: pricingProbeRows(this.timings.read(PRICING_RESOLVE_TIMING)),
    });
  }
}
