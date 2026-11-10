import type { MarketVolumeView } from "@lfd/contracts";

/**
 * **Marché vs volume** (pur) : le marché visé (acteurs, ≈ constant sur la fenêtre) et le
 * CA **de la période** (centimes), semaine par semaine.
 *
 * Le CA était auparavant **cumulé** : la courbe montait alors par construction, même
 * pendant un effondrement du CA hebdomadaire, et le graphe ne pouvait jamais annoncer
 * une mauvaise nouvelle. En périodique, elle monte et descend vraiment.
 */
export function computeMarketVolume(
  window: readonly string[],
  weeklyCents: ReadonlyMap<string, number>,
  marketActors: number,
  now: Date,
): MarketVolumeView {
  const points = window.map((weekStart) => ({
    weekStart,
    marketActors,
    volumeCents: weeklyCents.get(weekStart) ?? 0,
  }));
  return { points, computedAt: now.toISOString() };
}
