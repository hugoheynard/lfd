import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CacheMetricsReport } from "@lfd/ops-contract";

import { cacheCallTimingNames } from "../../platform/cache-calls/cache-call-timings.js";
import { VERSIONED_CONTENTS_CACHE_NAME } from "../../platform/day-versions/versioned-contents.js";
import { CacheOutcomeReader } from "../../platform/metrics/cache-outcome.reader.js";
import { TimingWindowReader } from "../../platform/metrics/timing-window.reader.js";
import { Clock } from "../../platform/time/clock.js";
import {
  DAY_VERSIONS_STORE,
  SHELF_LATE_FINISH_TIMING,
  SHELF_ROUND_TRIP_TIMING,
} from "../health/cache-call-readings.js";
import { cacheReports } from "../health/cache-readings.js";
import { resolveCacheMetricsDays } from "./cache-metrics-days.js";
import {
  HOUR_MS,
  hourStartOf,
  sharedCacheSeries,
  sharedObjectReports,
} from "./cache-metrics-report.js";
import { instanceCacheCalls, type StoreTimings } from "./instance-cache-calls.js";
import { ReadCacheMetricsQuery } from "./read-cache-metrics.query.js";
import { SharedCacheMetricsReader } from "./shared-cache-metrics.reader.js";

/** Le magasin des rayons, tel que la carte le nomme (`cache-call-readings.ts`). */
const SHELF_STORE = "shelf_cache";

/**
 * L'onglet Cache : les compteurs des objets (toute la flotte), et à côté ce
 * que CETTE instance a mesuré — durée des appels, replis, issues. Le
 * jugement est dans des fonctions pures ; ici, la collecte.
 */
@QueryHandler(ReadCacheMetricsQuery)
export class ReadCacheMetricsHandler implements IQueryHandler<
  ReadCacheMetricsQuery,
  CacheMetricsReport
> {
  constructor(
    private readonly shared: SharedCacheMetricsReader,
    private readonly timings: TimingWindowReader,
    private readonly outcomes: CacheOutcomeReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ReadCacheMetricsQuery): Promise<CacheMetricsReport> {
    const now = this.clock.now();
    const nowMs = now.getTime();
    const days = resolveCacheMetricsDays(query.days);
    const currentHour = hourStartOf(nowMs);
    const readings = await this.shared.read(currentHour - (days * 24 - 1) * HOUR_MS);
    const { calls, fallbacks } = instanceCacheCalls(
      this.storeTimings(),
      this.timings.windowMinutes,
    );
    return {
      generatedAt: now.toISOString(),
      days,
      lastHourStartedAt: new Date(currentHour).toISOString(),
      caches: sharedCacheSeries(readings, nowMs),
      objects: sharedObjectReports(readings, nowMs),
      instance: {
        windowMinutes: this.timings.windowMinutes,
        calls,
        fallbacks,
        outcomes: cacheReports(this.outcomes.read(), this.outcomes.windowMinutes),
      },
    };
  }

  private storeTimings(): readonly StoreTimings[] {
    const named = (store: string): StoreTimings => {
      const names = cacheCallTimingNames(store);
      return {
        store,
        roundTrips: this.timings.read(names.roundTrip),
        lateFinishes: this.timings.read(names.lateFinish),
      };
    };
    return [
      {
        store: SHELF_STORE,
        roundTrips: this.timings.read(SHELF_ROUND_TRIP_TIMING),
        lateFinishes: this.timings.read(SHELF_LATE_FINISH_TIMING),
      },
      named(DAY_VERSIONS_STORE),
      named(VERSIONED_CONTENTS_CACHE_NAME),
    ];
  }
}
