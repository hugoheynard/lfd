import type { MarketVolumeView } from "@lfd/contracts";

/**
 * **Marché vs volume** (pur) : le marché visé (acteurs, ≈ constant sur la fenêtre) et
 * le **CA cumulé** (centimes) semaine par semaine. `priorCents` = le CA déjà encaissé
 * AVANT la fenêtre (base honnête pour l'indexation), puis on additionne chaque semaine.
 */
export function computeMarketVolume(
  window: readonly string[],
  priorCents: number,
  weeklyCents: ReadonlyMap<string, number>,
  marketActors: number,
  now: Date,
): MarketVolumeView {
  let cumulative = priorCents;
  const points = window.map((weekStart) => {
    cumulative += weeklyCents.get(weekStart) ?? 0;
    return { weekStart, marketActors, volumeCents: cumulative };
  });
  return { points, computedAt: now.toISOString() };
}
