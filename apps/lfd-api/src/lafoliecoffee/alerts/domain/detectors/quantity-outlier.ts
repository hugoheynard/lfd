import {
  thresholdForBaseline,
  type AlertFinding,
  type QuantityOutlierParams,
} from "@lfd/contracts";

import type { AlertEvaluationContext, EvaluatedLine, ProductNorm } from "./context.js";
import { deviationPercent, rounded } from "./deviation.js";

/**
 * Deux points font une habitude, un seul fait une anecdote.
 *
 * C'est ce qui décide qu'un compte « a sa propre moyenne » — donc que la norme
 * catalogue doit lui laisser la main. Le nombre vit ici plutôt qu'en paramètre :
 * ce n'est pas un curseur commercial, c'est le seuil en dessous duquel comparer
 * un client à lui-même n'a pas de sens.
 */
const OWN_HABIT_MIN_ORDERS = 2;

/**
 * `product.quantity_outlier` — une quantité aberrante **pour le produit**.
 *
 * Le filet là où la dérive est structurellement aveugle : une première commande
 * n'a aucun historique de compte, et c'est là qu'un 5 tapé 500 passe. On change
 * alors de référence — la **médiane** du produit, tous comptes confondus.
 *
 * **Hausse seulement** : sur une première commande, prendre moins que la norme du
 * marché n'est pas un incident, c'est un essai.
 */
export function detectQuantityOutlier(
  context: AlertEvaluationContext,
  params: QuantityOutlierParams,
): AlertFinding[] {
  return context.lines
    .map((line) =>
      findingFor(line, context.norms.get(line.sku), context.history.get(line.sku) ?? [], params),
    )
    .filter(isFinding);
}

function findingFor(
  line: EvaluatedLine,
  norm: ProductNorm | undefined,
  past: readonly number[],
  params: QuantityOutlierParams,
): AlertFinding | null {
  if (norm === undefined || norm.sampleLines < params.minSampleLines || norm.medianQuantity <= 0) {
    return null;
  }
  // Le compte a sa propre moyenne ? Elle est plus fine, elle fait autorité — la
  // norme catalogue se tait, sinon les deux règles crient pour un même écart.
  if (params.onlyWithoutAccountBaseline && past.length >= OWN_HABIT_MIN_ORDERS) {
    return null;
  }
  const deviation = deviationPercent(line.quantity, norm.medianQuantity);
  const threshold = thresholdForBaseline(params.riseTiers, norm.medianQuantity);
  if (deviation <= 0 || threshold === null || deviation < threshold) {
    return null;
  }
  return {
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    baseline: rounded(norm.medianQuantity),
    deviationPercent: deviation,
    message: `${line.productName} — ${line.quantity} alors qu'on en commande ${rounded(norm.medianQuantity)} d'habitude (+${deviation} %)`,
  };
}

function isFinding(finding: AlertFinding | null): finding is AlertFinding {
  return finding !== null;
}
