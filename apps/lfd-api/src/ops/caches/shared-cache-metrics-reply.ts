import type { SharedCacheHour, SharedObjectPeak } from "./shared-cache-metrics.reader.js";

/** La réponse de `GET /metrics` d'un objet, lue sur le fil. */
export interface SharedCacheMetricsReply {
  readonly hours: readonly SharedCacheHour[];
  readonly peaks: readonly SharedObjectPeak[];
}

/**
 * Lit la réponse d'un objet ; `null` si elle n'en a pas la forme. Une ligne
 * mal formée rend toute la réponse illisible, plutôt qu'une série trouée
 * sans le dire.
 */
export function sharedCacheMetricsReplyOf(raw: unknown): SharedCacheMetricsReply | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const rows: unknown = Reflect.get(raw, "rows");
  const peaks: unknown = Reflect.get(raw, "peaks");
  if (!Array.isArray(rows) || !Array.isArray(peaks)) {
    return null;
  }
  const hours = rows.map(hourOf);
  const peakRows = peaks.map(peakOf);
  if (hours.some((one) => one === null) || peakRows.some((one) => one === null)) {
    return null;
  }
  return {
    hours: hours.filter((one): one is SharedCacheHour => one !== null),
    peaks: peakRows.filter((one): one is SharedObjectPeak => one !== null),
  };
}

function hourOf(raw: unknown): SharedCacheHour | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const field = (name: string): unknown => Reflect.get(raw, name);
  const cache = field("cache");
  const counts = ["hourMs", "hits", "misses", "stores", "tooLarge", "persons"].map(field);
  const bytes = field("bytes");
  const entries = field("entries");
  if (typeof cache !== "string" || !counts.every(isCount)) {
    return null;
  }
  if (!isCountOrNull(bytes) || !isCountOrNull(entries)) {
    return null;
  }
  const [hourMs, hits, misses, stores, tooLarge, persons] = counts.filter(isCount);
  return {
    cache,
    hourMs: hourMs ?? 0,
    hits: hits ?? 0,
    misses: misses ?? 0,
    stores: stores ?? 0,
    tooLarge: tooLarge ?? 0,
    bytes,
    entries,
    persons: persons ?? 0,
  };
}

function peakOf(raw: unknown): SharedObjectPeak | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const hourMs: unknown = Reflect.get(raw, "hourMs");
  const perSecond: unknown = Reflect.get(raw, "perSecond");
  return isCount(hourMs) && isCount(perSecond) ? { hourMs, perSecond } : null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCountOrNull(value: unknown): value is number | null {
  return value === null || isCount(value);
}
