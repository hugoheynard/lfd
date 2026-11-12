import type { CacheCallReport, CacheFallbackCount } from "@lfd/ops-contract";

import { cacheCallReports } from "../health/cache-call-readings.js";
import type { PricingSample } from "../health/pricing-probe.js";

/** L'issue d'un aller-retour servi à temps, au mot du producteur (`BoundedCallGuard`). */
const IN_TIME = "in_time";

/** Les mesures d'un magasin sur la fenêtre de l'instance. */
export interface StoreTimings {
  readonly store: string;
  readonly roundTrips: readonly PricingSample[];
  readonly lateFinishes: readonly PricingSample[];
}

/**
 * **La durée des appels et les replis vers la base, par magasin** — ce que
 * l'instance qui répond a mesuré. Un repli est un aller-retour abandonné au
 * délai ou en erreur ; ceux que le disjoncteur ouvert a coupés ne sont pas
 * mesurés par le garde, donc pas comptés ici.
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
    fallbacks: stores.map((one) => ({
      store: one.store,
      count: one.roundTrips.filter((sample) => sample.labels["outcome"] !== IN_TIME).length,
    })),
  };
}
