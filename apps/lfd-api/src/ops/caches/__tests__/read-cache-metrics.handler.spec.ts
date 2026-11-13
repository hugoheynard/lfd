import {
  CacheOutcomeReader,
  type CacheOutcomeTally,
} from "../../../platform/metrics/cache-outcome.reader.js";
import {
  TimingWindowReader,
  type TimingSample,
} from "../../../platform/metrics/timing-window.reader.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { HOUR_MS } from "../cache-metrics-report.js";
import { ReadCacheMetricsHandler } from "../read-cache-metrics.handler.js";
import { ReadCacheMetricsQuery } from "../read-cache-metrics.query.js";
import {
  SharedCacheMetricsReader,
  type SharedObjectReading,
} from "../shared-cache-metrics.reader.js";

class RecordingShared extends SharedCacheMetricsReader {
  readonly since: number[] = [];

  constructor(private readonly readings: readonly SharedObjectReading[]) {
    super();
  }

  read(sinceMs: number): Promise<readonly SharedObjectReading[]> {
    this.since.push(sinceMs);
    return Promise.resolve(this.readings);
  }
}

class FixedWindow extends TimingWindowReader {
  readonly windowMinutes = 30;

  constructor(private readonly samples: Readonly<Record<string, readonly TimingSample[]>>) {
    super();
  }

  read(name: string): readonly TimingSample[] {
    return this.samples[name] ?? [];
  }
}

class FixedOutcomes extends CacheOutcomeReader {
  readonly windowMinutes = 30;

  read(): readonly CacheOutcomeTally[] {
    return [
      { cache: "principal", total: 2, outcomes: [{ outcome: "memory", count: 2, share: 1 }] },
    ];
  }
}

// L'instant n'est comparé qu'aux heures que le test en dérive.
const NOW = new Date(3000 * HOUR_MS + 5000);
const CURRENT = 3000 * HOUR_MS;

function sample(outcome: string, ms: number): TimingSample {
  return { labels: { operation: "read", outcome }, ms, size: 1 };
}

function fallback(reason: string): TimingSample {
  return { labels: { operation: "read", reason }, ms: 0, size: 1 };
}

describe("ReadCacheMetricsHandler", () => {
  it("lit les objets sur la période bornée, et joint les mesures de l'instance", async () => {
    const shared = new RecordingShared([
      {
        object: "day-versions",
        state: "read",
        hours: [
          {
            cache: "catalog-admin",
            hourMs: CURRENT,
            hits: 3,
            misses: 1,
            stores: 1,
            tooLarge: 0,
            bytes: 900,
            entries: 1,
            persons: 2,
          },
        ],
        peaks: [{ hourMs: CURRENT, perSecond: 5 }],
      },
    ]);
    const handler = new ReadCacheMetricsHandler(
      shared,
      new FixedWindow({
        "versioned_contents.round_trip": [
          sample("in_time", 4),
          sample("late", 100),
          sample("error", 2),
        ],
        "versioned_contents.fallback": [fallback("timeout"), fallback("error")],
      }),
      new FixedOutcomes(),
      new FixedClock(NOW),
    );

    const report = await handler.execute(new ReadCacheMetricsQuery("2"));

    expect(shared.since).toEqual([CURRENT - 47 * HOUR_MS]);
    expect(report).toMatchObject({
      days: 2,
      lastHourStartedAt: new Date(CURRENT).toISOString(),
      caches: [{ cache: "catalog-admin", lastHour: { hitRate: 0.75, persons: 2, bytes: 900 } }],
      objects: [{ object: "day-versions", lastHourPeakPerSecond: 5 }],
    });
    const none = { count: 0, reasons: {}, breakerOpenings: 0 };
    expect(report.instance.fallbacks).toEqual([
      { store: "shelf_cache", ...none },
      { store: "day_versions", ...none },
      {
        store: "versioned_contents",
        count: 2,
        reasons: { timeout: 1, error: 1 },
        breakerOpenings: 0,
      },
      { store: "day_contents", ...none },
    ]);
    expect(report.instance.calls).toEqual([
      expect.objectContaining({
        store: "versioned_contents",
        operation: "read",
        calls: 3,
        late: 1,
      }),
    ]);
    expect(report.instance.outcomes).toHaveLength(1);
  });

  /**
   * Régression : les contenus des écrans de journée n'apparaissaient pas dans
   * l'onglet — un disjoncteur ouvert les renvoyait en base sans aucune trace.
   */
  it("rapporte les contenus de journée : durées, replis par raison, ouvertures", async () => {
    const handler = new ReadCacheMetricsHandler(
      new RecordingShared([]),
      new FixedWindow({
        "day_contents.round_trip": [sample("error", 3), sample("in_time", 5)],
        "day_contents.fallback": [
          fallback("error"),
          fallback("breaker_open"),
          fallback("breaker_open"),
        ],
        "day_contents.breaker_opened": [{ labels: {}, ms: 0, size: 1 }],
      }),
      new FixedOutcomes(),
      new FixedClock(NOW),
    );

    const report = await handler.execute(new ReadCacheMetricsQuery("1"));

    expect(report.instance.fallbacks).toContainEqual({
      store: "day_contents",
      count: 3,
      reasons: { error: 1, breaker_open: 2 },
      breakerOpenings: 1,
    });
    expect(report.instance.calls).toContainEqual(
      expect.objectContaining({ store: "day_contents", operation: "read", calls: 2 }),
    );
  });
});
