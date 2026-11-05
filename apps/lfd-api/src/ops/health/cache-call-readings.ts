import type { CacheCallReport } from "@lfd/ops-contract";

import { percentile, type PricingSample } from "./pricing-probe.js";

/**
 * Les noms des mesures de l'appel à l'objet des rayons, recopiés du producteur
 * (`b2b/catalog/application/shelf-call-guard.ts`, `SHELF_ROUND_TRIP_TIMING` et
 * `SHELF_LATE_FINISH_TIMING`), qu'`ops` n'a pas le droit d'importer (vérifié
 * le 2026-11-05).
 */
export const SHELF_ROUND_TRIP_TIMING = "shelf_cache.round_trip";
export const SHELF_LATE_FINISH_TIMING = "shelf_cache.late_finish";

/** Le magasin que ces mesures décrivent, tel que la carte le nomme. */
const SHELF_STORE = "shelf_cache";

/** L'issue d'un aller-retour abandonné au délai, au mot du producteur. */
const LATE = "late";

/** Une étiquette absente se dit, plutôt que d'être rangée sous une autre. */
const UNLABELLED = "?";

/**
 * **La durée des appels à l'objet des rayons**, une ligne par opération — pur.
 *
 * Rien n'est jugé : le seuil (le délai du repli) appartient au producteur, et
 * la carte montre p50 / p95 à côté du nombre d'abandons. Une opération sans
 * appel n'a pas de ligne : un « 0 ms » se lirait comme un appel gratuit.
 */
export function cacheCallReports(
  roundTrips: readonly PricingSample[],
  lateFinishes: readonly PricingSample[],
  windowMinutes: number,
): readonly CacheCallReport[] {
  const byOperation = groupByOperation(roundTrips);
  const finishes = groupByOperation(lateFinishes);
  return [...byOperation.entries()]
    .map(([operation, group]) => {
      const durations = group.map((one) => one.ms);
      const finished = (finishes.get(operation) ?? []).map((one) => one.ms);
      return {
        store: SHELF_STORE,
        operation,
        calls: group.length,
        late: group.filter((one) => one.labels["outcome"] === LATE).length,
        p50Ms: Math.round(percentile(durations, 0.5)),
        p95Ms: Math.round(percentile(durations, 0.95)),
        lateFinishP95Ms: finished.length === 0 ? null : Math.round(percentile(finished, 0.95)),
        windowMinutes,
      };
    })
    .sort((left, right) => left.operation.localeCompare(right.operation));
}

function groupByOperation(
  samples: readonly PricingSample[],
): ReadonlyMap<string, readonly PricingSample[]> {
  const groups = new Map<string, PricingSample[]>();
  for (const sample of samples) {
    const operation = sample.labels["operation"] ?? UNLABELLED;
    groups.set(operation, [...(groups.get(operation) ?? []), sample]);
  }
  return groups;
}
