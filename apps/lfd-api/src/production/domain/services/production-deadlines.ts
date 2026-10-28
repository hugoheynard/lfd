import type { TrancheThreshold } from "./production-tranches.js";

/**
 * **Les paliers d'une ligne de la fiche** (plan
 * `documentation/fournil/plan-fournee-v3.md`, §2) — ses tranches, rendues non
 * cumulées et ajustées à la quantité que la fiche affiche.
 *
 * Fonction pure. Elle ne range rien : le rangement (mode fixe ou calculé,
 * arrondi « jamais plus tard », `before_first`) est celui de
 * `rangeInTranches`, appelé en amont. Elle ne fait que trois choses :
 *
 * - elle garde de chaque tranche sa quantité PROPRE et son heure — `before_first`
 *   garde l'heure de la première tranche, `undated` et `day` n'en ont pas ;
 * - elle porte **l'écart au dernier palier** : la fiche d'une journée arrêtée
 *   lit son instantané, les besoins sont lus en direct, et les deux divergent
 *   dès qu'une commande arrive ou part. Un écart positif grossit le dernier
 *   palier ; un écart négatif le rogne, puis l'avant-dernier, jusqu'à ce que la
 *   somme tombe juste — l'heure la plus tardive cède d'abord ;
 * - sans aucun besoin connu pour le SKU, un seul palier, la journée
 *   (`before: null`) : aucune heure n'est inventée.
 */

/** Un palier : sa quantité propre, et l'heure avant laquelle la sortir. */
export interface WorkshopDeadline {
  readonly quantity: number;
  /** `HH:mm`, ou `null` = la journée. */
  readonly before: string | null;
}

/** Les paliers d'une ligne de `quantity` pièces, de somme `quantity`. */
export function deadlinesOf(
  quantity: number,
  thresholds: readonly TrancheThreshold[],
): readonly WorkshopDeadline[] {
  if (quantity <= 0) {
    return [];
  }
  const steps = thresholds
    .filter((threshold) => threshold.quantity > 0)
    .map((threshold) => ({ quantity: threshold.quantity, before: threshold.before }));
  if (steps.length === 0) {
    return [{ quantity, before: null }];
  }
  return fitted(steps, quantity);
}

/** Porte l'écart sur la fin de la liste, sans jamais rendre un palier vide. */
function fitted(steps: readonly WorkshopDeadline[], quantity: number): readonly WorkshopDeadline[] {
  const total = steps.reduce((sum, step) => sum + step.quantity, 0);
  if (total <= quantity) {
    const last = steps.length - 1;
    return steps.map((step, index) =>
      index === last ? { ...step, quantity: step.quantity + quantity - total } : step,
    );
  }
  let excess = total - quantity;
  const kept: WorkshopDeadline[] = [];
  for (const step of [...steps].reverse()) {
    const cut = Math.min(excess, step.quantity);
    excess -= cut;
    if (step.quantity - cut > 0) {
      kept.unshift({ ...step, quantity: step.quantity - cut });
    }
  }
  return kept;
}
