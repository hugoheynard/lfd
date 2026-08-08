import type { SectorRevenueSeries, SectorRevenueView } from "@lfd/contracts";

/**
 * **CA par secteur NAF dans le temps** (pur) : une série par secteur *configuré*
 * (assiette stable, comparable), chaque valeur = le CA (centimes) de la semaine.
 * Les codes hors cible sont ignorés en amont (le reader ne remonte que le configuré).
 */
export function computeSectorRevenue(
  window: readonly string[],
  nafLabels: ReadonlyMap<string, string>,
  weeklyByNaf: ReadonlyMap<string, ReadonlyMap<string, number>>,
  now: Date,
): SectorRevenueView {
  const series: SectorRevenueSeries[] = [...nafLabels.entries()].map(([code, label]) => ({
    code,
    label,
    weekly: window.map((week) => weeklyByNaf.get(week)?.get(code) ?? 0),
  }));
  return { weeks: [...window], series, computedAt: now.toISOString() };
}
