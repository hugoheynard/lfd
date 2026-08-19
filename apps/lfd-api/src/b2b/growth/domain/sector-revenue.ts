import type { SectorRevenueSeries, SectorRevenueView } from "@lfd/contracts";

/**
 * **CA par secteur NAF dans le temps** (pur) : une série par secteur *configuré*
 * (assiette stable, comparable), chaque valeur = le CA (centimes) du **jour** (grain le
 * plus fin ; le front ré-agrège en semaine/mois/trimestre/année). Les codes hors cible
 * sont ignorés en amont (le reader ne remonte que le configuré).
 */
export function computeSectorRevenue(
  window: readonly string[],
  nafLabels: ReadonlyMap<string, string>,
  dailyByNaf: ReadonlyMap<string, ReadonlyMap<string, number>>,
  now: Date,
): SectorRevenueView {
  const series: SectorRevenueSeries[] = [...nafLabels.entries()].map(([code, label]) => ({
    code,
    label,
    daily: window.map((day) => dailyByNaf.get(day)?.get(code) ?? 0),
  }));
  return { days: [...window], series, computedAt: now.toISOString() };
}
