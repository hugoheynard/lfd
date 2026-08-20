import {
  VITAL_THRESHOLDS,
  vitalVerdict,
  type NodeReading,
  type WebVitalName,
} from "@lfd/ops-contract";

/**
 * **Ce qu'un front dit de lui-même**, par la voix de ceux qui l'utilisent.
 *
 * Les fronts étaient les seuls nœuds sans aucune mesure : leur sonde dit
 * « servi », elle ne compte rien. Ces trois relevés sont la première chose qu'ils
 * savent dire — et la seule qui parle de l'expérience réelle plutôt que de ce que
 * Cloudflare a bien voulu rendre.
 */

/** Comment on rend une valeur : les millisecondes s'arrondissent, pas un score. */
function display(metric: WebVitalName, value: number): number {
  return VITAL_THRESHOLDS[metric].unit === "ms" ? Math.round(value) : Math.round(value * 100) / 100;
}

const VERDICT_LABEL: Readonly<Record<"good" | "fair" | "poor", string>> = {
  good: "bon",
  fair: "à surveiller",
  poor: "mauvais",
};

const MEANING: Readonly<Record<WebVitalName, string>> = {
  LCP: "quand on voit quelque chose d'utile",
  INP: "quand un clic obtient une réponse",
  CLS: "de combien le contenu saute pendant le chargement",
};

/**
 * Les relevés d'un front. Vide quand personne n'a chargé la page sur la fenêtre
 * — un « 0 ms » se lirait comme une page instantanée, ce qui est le contraire
 * d'une absence de mesure.
 */
export function vitalsReadings(
  percentiles: ReadonlyMap<WebVitalName, number>,
): readonly NodeReading[] {
  return [...percentiles.entries()].map(([metric, value]) => ({
    label: metric,
    value: display(metric, value),
    unit: VITAL_THRESHOLDS[metric].unit,
    hint: `${MEANING[metric]} — 75ᵉ centile des visites récentes, ${VERDICT_LABEL[vitalVerdict(metric, value)]} (seuil ${display(metric, VITAL_THRESHOLDS[metric].good)}${VITAL_THRESHOLDS[metric].unit}).`,
  }));
}
