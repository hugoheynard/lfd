import type { CacheReport } from "@lfd/ops-contract";

import type { CacheOutcomeTally } from "../../platform/metrics/cache-outcome.reader.js";

/** Une part arrondie au millième : 0,1 % suffit à lire un taux, et la vue reste stable. */
const SHARE_PRECISION = 1_000;

/**
 * **Le relevé des caches** (plan du cache du catalogue, C5) : ce que le
 * compteur de `platform` a vu, mis à la forme de la carte.
 *
 * Rien n'y est interprété : `ops` ne sait pas ce que veut dire `memory` ou
 * `stamp_moved` — le producteur les a nommés, la carte les montre. Un cache
 * qui n'a rien servi sur la fenêtre n'a pas de ligne, plutôt qu'un 0 % qui
 * se lirait comme un cache qui rate tout.
 */
export function cacheReports(
  tallies: readonly CacheOutcomeTally[],
  windowMinutes: number,
): readonly CacheReport[] {
  return tallies
    .filter((tally) => tally.total > 0)
    .map((tally) => ({
      cache: tally.cache,
      total: tally.total,
      windowMinutes,
      outcomes: tally.outcomes.map((one) => ({
        outcome: one.outcome,
        count: one.count,
        share: Math.round(one.share * SHARE_PRECISION) / SHARE_PRECISION,
      })),
    }));
}
