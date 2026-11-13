import type { CacheCallReport, CacheFallbackCount, CacheFallbackReason } from "@lfd/ops-contract";

import { cacheCallReports } from "../health/cache-call-readings.js";
import type { PricingSample } from "../health/pricing-probe.js";

/** Les raisons d'un repli, au mot du producteur (`BoundedCallGuard`). */
const FALLBACK_REASONS: readonly CacheFallbackReason[] = [
  "timeout",
  "error",
  "unreadable",
  "breaker_open",
];

/** Les mesures d'un magasin sur la fenêtre de l'instance. */
export interface StoreTimings {
  readonly store: string;
  readonly roundTrips: readonly PricingSample[];
  readonly lateFinishes: readonly PricingSample[];
  /** `<cache>.fallback` : un échantillon par repli, étiqueté `reason`. */
  readonly fallbacks: readonly PricingSample[];
  /** `<cache>.breaker_opened` : un échantillon par ouverture. */
  readonly breakerOpenings: readonly PricingSample[];
}

/**
 * **La durée des appels et les replis vers la base, par magasin** — ce que
 * l'instance qui répond a mesuré. Un repli est un appel qui n'a pas servi —
 * délai, erreur, réponse illisible, ou disjoncteur ouvert (aucun appel parti) —
 * compté par raison, avec les ouvertures du disjoncteur.
 */
export function instanceCacheCalls(
  stores: readonly StoreTimings[],
  windowMinutes: number,
): {
  readonly calls: readonly CacheCallReport[];
  readonly fallbacks: readonly CacheFallbackCount[];
} {
  return {
    calls: stores.flatMap((one) =>
      cacheCallReports(one.roundTrips, one.lateFinishes, windowMinutes, one.store),
    ),
    fallbacks: stores.map((one) => fallbackCount(one)),
  };
}

function fallbackCount(one: StoreTimings): CacheFallbackCount {
  const reasons: Partial<Record<CacheFallbackReason, number>> = {};
  for (const reason of FALLBACK_REASONS) {
    const count = one.fallbacks.filter((sample) => sample.labels["reason"] === reason).length;
    if (count > 0) {
      reasons[reason] = count;
    }
  }
  return {
    store: one.store,
    count: one.fallbacks.length,
    reasons,
    breakerOpenings: one.breakerOpenings.length,
  };
}
