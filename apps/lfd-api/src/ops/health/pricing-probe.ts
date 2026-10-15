import type { PricingProbeRow, PricingProbeState } from "@lfd/ops-contract";

/**
 * **La sonde du calcul des prix, jugée** — pur, donc testé aux bornes
 * (`documentation/ops/sonde-calcul-des-prix.md`).
 *
 * `ops` ne connaît pas le commerce : il lit des mesures rangées sous un NOM,
 * avec deux étiquettes. Le nom est recopié du producteur
 * (`b2b/pricing/application/pricing-caller.ts`, `PRICING_RESOLVE_TIMING`),
 * qu'`ops` n'a pas le droit d'importer (vérifié le 2026-10-15 :
 * `pricing.resolve`).
 */
export const PRICING_RESOLVE_TIMING = "pricing.resolve";

/**
 * Le seuil d'alerte sur le p95, proposé par la doc (300 ms). Réglable comme
 * les seuils de la médiathèque : ici, dans le code, avec sa source.
 */
export const PRICING_P95_THRESHOLD_MS = 300;

/** `attention` à partir de cette part du seuil — la même que les seuils média. */
export const PRICING_ATTENTION_RATIO = 0.8;

/** Ce que la fenêtre rend d'une mesure — la forme de `TimingSample`. */
export interface PricingSample {
  readonly labels: Readonly<Record<string, string>>;
  readonly ms: number;
  readonly size: number;
}

/** Une étiquette absente se dit, plutôt que d'être rangée sous une autre. */
const UNLABELLED = "?";

/** Le jugement : `exceeded` dès que le seuil est ATTEINT. */
export function pricingState(p95Ms: number): PricingProbeState {
  if (p95Ms >= PRICING_P95_THRESHOLD_MS) {
    return "exceeded";
  }
  return p95Ms >= PRICING_P95_THRESHOLD_MS * PRICING_ATTENTION_RATIO ? "attention" : "ok";
}

/**
 * Les lignes de la carte, une par appelant × audience, les plus coûteuses
 * d'abord. Vide sans mesure : un « 0 ms » se lirait comme un calcul gratuit.
 */
export function pricingProbeRows(samples: readonly PricingSample[]): readonly PricingProbeRow[] {
  const groups = new Map<string, PricingSample[]>();
  for (const sample of samples) {
    const key = `${sample.labels["caller"] ?? UNLABELLED}\u0000${sample.labels["audience"] ?? UNLABELLED}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return [...groups.entries()]
    .map(([key, group]) => rowOf(key, group))
    .sort((left, right) => right.p95Ms - left.p95Ms || left.caller.localeCompare(right.caller));
}

function rowOf(key: string, group: readonly PricingSample[]): PricingProbeRow {
  const [caller = UNLABELLED, audience = UNLABELLED] = key.split("\u0000");
  const durations = group.map((one) => one.ms);
  const p95Ms = Math.round(percentile(durations, 0.95));
  const items = group.reduce((sum, one) => sum + one.size, 0);
  return {
    caller,
    audience,
    lots: group.length,
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms,
    meanItems: Math.round((items / group.length) * 10) / 10,
    state: pricingState(p95Ms),
  };
}

/** Centile par la méthode du plus proche rang — pas d'interpolation à inventer. */
export function percentile(values: readonly number[], rank: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(sorted.length * rank) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}
