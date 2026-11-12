import type {
  ObjectPeakPoint,
  SharedCacheFigures,
  SharedCachePoint,
  SharedCacheSeries,
  SharedObjectReport,
} from "@lfd/ops-contract";

import type {
  SharedCacheHour,
  SharedObjectPeak,
  SharedObjectReading,
} from "./shared-cache-metrics.reader.js";

export const HOUR_MS = 3_600_000;
const DAY_HOURS = 24;
const RATE_PRECISION = 1_000;

/** Le début de l'heure d'un instant. */
export function hourStartOf(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/**
 * **Les séries des caches partagés** — une par cache, triées par nom. La
 * taille n'est relevée qu'aux rangements : une heure sans relevé reprend la
 * dernière taille connue, plutôt qu'un creux qui se lirait comme un cache vidé.
 */
export function sharedCacheSeries(
  readings: readonly SharedObjectReading[],
  nowMs: number,
): readonly SharedCacheSeries[] {
  const currentHour = hourStartOf(nowMs);
  const series: SharedCacheSeries[] = [];
  for (const reading of readings) {
    for (const [cache, hours] of byCache(reading.hours)) {
      const points = pointsOf(hours);
      const latest = points.at(-1);
      series.push({
        cache,
        object: reading.object,
        lastHour: figuresOf(
          points.filter((one) => one.hourMs === currentHour),
          latest,
        ),
        last24h: figuresOf(
          points.filter((one) => one.hourMs > currentHour - DAY_HOURS * HOUR_MS),
          latest,
        ),
        points: points.map(({ hourMs, ...figures }) => ({
          hour: new Date(hourMs).toISOString(),
          ...figures,
        })),
      });
    }
  }
  return series.sort((left, right) => left.cache.localeCompare(right.cache));
}

/** L'état de chaque objet et ses pics de requêtes par seconde. */
export function sharedObjectReports(
  readings: readonly SharedObjectReading[],
  nowMs: number,
): readonly SharedObjectReport[] {
  const currentHour = hourStartOf(nowMs);
  return readings.map((reading) => ({
    object: reading.object,
    state: reading.state,
    lastHourPeakPerSecond: peakOf(reading.peaks.filter((one) => one.hourMs === currentHour)),
    last24hPeakPerSecond: peakOf(
      reading.peaks.filter((one) => one.hourMs > currentHour - DAY_HOURS * HOUR_MS),
    ),
    peaks: [...reading.peaks]
      .sort((left, right) => left.hourMs - right.hourMs)
      .map((one): ObjectPeakPoint => ({
        hour: new Date(one.hourMs).toISOString(),
        perSecond: one.perSecond,
      })),
  }));
}

type HourPoint = Omit<SharedCachePoint, "hour"> & { readonly hourMs: number };

function byCache(hours: readonly SharedCacheHour[]): ReadonlyMap<string, SharedCacheHour[]> {
  const groups = new Map<string, SharedCacheHour[]>();
  for (const hour of hours) {
    groups.set(hour.cache, [...(groups.get(hour.cache) ?? []), hour]);
  }
  return groups;
}

function pointsOf(hours: readonly SharedCacheHour[]): readonly HourPoint[] {
  let bytes: number | null = null;
  let entries: number | null = null;
  return [...hours]
    .sort((left, right) => left.hourMs - right.hourMs)
    .map((hour) => {
      bytes = hour.bytes ?? bytes;
      entries = hour.entries ?? entries;
      return {
        hourMs: hour.hourMs,
        hits: hour.hits,
        misses: hour.misses,
        hitRate: rateOf(hour.hits, hour.misses),
        stores: hour.stores,
        tooLarge: hour.tooLarge,
        bytes,
        entries,
        persons: hour.persons,
      };
    });
}

/**
 * Les chiffres d'une période. La taille est la dernière connue (`latest`),
 * même relevée avant la période : une taille ne se périme pas faute de
 * rangement. Les personnes : le plus fort compte d'une heure.
 */
function figuresOf(
  points: readonly HourPoint[],
  latest: HourPoint | undefined,
): SharedCacheFigures {
  const hits = sum(points, (one) => one.hits);
  const misses = sum(points, (one) => one.misses);
  return {
    hits,
    misses,
    hitRate: rateOf(hits, misses),
    stores: sum(points, (one) => one.stores),
    tooLarge: sum(points, (one) => one.tooLarge),
    bytes: latest?.bytes ?? null,
    entries: latest?.entries ?? null,
    persons: points.reduce((max, one) => Math.max(max, one.persons), 0),
  };
}

function rateOf(hits: number, misses: number): number | null {
  const reads = hits + misses;
  return reads === 0 ? null : Math.round((hits / reads) * RATE_PRECISION) / RATE_PRECISION;
}

function sum(points: readonly HourPoint[], pick: (point: HourPoint) => number): number {
  return points.reduce((total, one) => total + pick(one), 0);
}

function peakOf(peaks: readonly SharedObjectPeak[]): number | null {
  return peaks.length === 0 ? null : Math.max(...peaks.map((one) => one.perSecond));
}
