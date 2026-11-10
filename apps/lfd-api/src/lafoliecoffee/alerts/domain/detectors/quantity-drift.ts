import { thresholdForBaseline, type AlertFinding, type QuantityDriftParams } from "@lfd/contracts";

import type { AlertEvaluationContext, EvaluatedLine } from "./context.js";
import { deviationPercent, magnitude, mean, rounded } from "./deviation.js";

/**
 * `product.quantity_drift` — l'écart à **sa propre moyenne** pour ce produit.
 *
 * La référence la plus fine dont on dispose : elle sait que ce client-là prend ce
 * produit-là à l'unité ou par palettes. Chaque sens a **son** échelle — une
 * hausse est non bornée, une baisse plafonne sous 100 % — et les comparer au même
 * barème rendait la baisse indétectable sur les petits volumes.
 */
export function detectQuantityDrift(
  context: AlertEvaluationContext,
  params: QuantityDriftParams,
): AlertFinding[] {
  return context.lines
    .map((line) => findingFor(line, context.history.get(line.sku) ?? [], params))
    .filter(isFinding);
}

function findingFor(
  line: EvaluatedLine,
  past: readonly number[],
  params: QuantityDriftParams,
): AlertFinding | null {
  // Sous ce plancher, « la moyenne » n'en est pas une : la règle se tait plutôt
  // que de comparer à un ou deux points.
  if (past.length < params.minBaselineOrders) {
    return null;
  }
  const baseline = mean(past.slice(-params.baselineOrders));
  if (baseline === null || baseline <= 0) {
    return null;
  }
  const deviation = deviationPercent(line.quantity, baseline);
  const threshold = thresholdFor(deviation, baseline, params);
  if (threshold === null || magnitude(deviation) < threshold) {
    return null;
  }
  return {
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    baseline: rounded(baseline),
    deviationPercent: deviation,
    message: `${line.productName} — ${line.quantity} contre ${rounded(baseline)} en moyenne (${signed(deviation)} %)`,
  };
}

/**
 * Le seuil du **sens observé**, ou `null` si ce sens n'est pas surveillé. Une
 * quantité exactement égale à la moyenne n'est un écart dans aucun sens.
 */
function thresholdFor(
  deviation: number,
  baseline: number,
  params: QuantityDriftParams,
): number | null {
  if (deviation > 0) {
    return params.direction === "down" ? null : thresholdForBaseline(params.riseTiers, baseline);
  }
  if (deviation < 0) {
    return params.direction === "up" ? null : thresholdForBaseline(params.dropTiers, baseline);
  }
  return null;
}

function signed(deviation: number): string {
  return deviation > 0 ? `+${deviation}` : `${deviation}`;
}

function isFinding(finding: AlertFinding | null): finding is AlertFinding {
  return finding !== null;
}
