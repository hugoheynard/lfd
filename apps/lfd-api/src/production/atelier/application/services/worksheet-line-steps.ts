import type { GroupingSource } from "../../../shared/print/index.js";
import type { LineStepState } from "../../domain/entities/line-step.js";
import { type LineStation, pendingStepsOf } from "../../domain/services/line-steps.js";

/** Aucune étape n'est exigée : mode boutique, ou postes illisibles. */
const NO_STEP: readonly string[] = [];

/**
 * **Ce qui attend sur chaque ligne de la fiche** (
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.6) : SKU
 * → les postes d'étape qui n'ont pas coché, dans l'ordre des fiches.
 *
 * Les postes se lisent sur le rangement par poste déjà lu (la carte
 * courante) : en mode boutique, ou postes illisibles — rangé par rayon —,
 * aucune étape n'est exigée et rien n'est relu.
 */
export function stepsPendingOf(
  source: GroupingSource,
  steps: readonly LineStepState[],
): (sku: string) => readonly string[] {
  if (source.mode !== "workstation") {
    return () => NO_STEP;
  }
  const { placement } = source;
  const order = new Map(placement.workstations.map((station, index) => [station.id, index]));
  const rank = (station: LineStation): number =>
    order.get(station.workstationId) ?? Number.MAX_SAFE_INTEGER;
  const status = new Map(steps.map((step) => [stepKey(step.sku, step.workstationId), step.status]));
  return (sku) => {
    const article = placement.articles.get(sku);
    const stations =
      article === undefined ? [] : (placement.byProduct.get(article.productSku) ?? []);
    return pendingStepsOf(
      [...stations].sort((left, right) => rank(left) - rank(right)),
      (workstationId) => status.get(stepKey(sku, workstationId)),
    );
  };
}

function stepKey(sku: string, workstationId: string): string {
  return JSON.stringify([sku, workstationId]);
}
