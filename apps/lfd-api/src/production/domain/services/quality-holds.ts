import type { QualityCheck } from "../entities/quality-check.js";
import { qualityTargetKey } from "../value-objects/quality-check-target.js";
import { currentChecks, heldOrderIds, type PlannedOrderLine } from "./quality-verdicts.js";

/**
 * **Ce qu'un nouveau verdict fait à la retenue de sa cible** (D9).
 *
 * `raised` : le verdict courant de la cible devient `blocking` alors qu'il ne
 * l'était pas ; il porte les commandes que CE blocage retient à cet instant —
 * pour une ligne, celles du plan qui portent le SKU (D6). Sans cette liste,
 * « qui a été retenu » ne se reconstituerait pas : le plan bouge au retirage.
 *
 * `lifted` : le verdict courant cesse d'être `blocking`. Un blocage rendu sur
 * un blocage, ou une réserve sur un OK, ne change rien à la retenue : `null`.
 */
export type HoldTransition =
  | { readonly kind: "raised"; readonly heldOrderIds: readonly string[] }
  | { readonly kind: "lifted" }
  | null;

/**
 * @param previous les contrôles déjà écrits de la journée, sans `next`.
 * @param plan les lignes du plan de la journée, à l'instant du verdict.
 */
export function holdTransition(
  previous: readonly QualityCheck[],
  next: QualityCheck,
  plan: readonly PlannedOrderLine[],
): HoldTransition {
  const key = qualityTargetKey(next.target);
  const sameDay = previous.filter((check) => check.serviceDay.equals(next.serviceDay));
  // Le nouveau verdict ne devient courant que s'il est le plus récent : un
  // contrôle écrit « dans le passé » (horloges) ne lève ni ne pose rien.
  if (currentChecks([...sameDay, next]).get(key) !== next) {
    return null;
  }
  const wasBlocking = currentChecks(sameDay).get(key)?.isBlocking ?? false;
  if (next.isBlocking && !wasBlocking) {
    const held = [...heldOrderIds(next.serviceDay, [next], plan)].sort();
    return { kind: "raised", heldOrderIds: held };
  }
  if (!next.isBlocking && wasBlocking) {
    return { kind: "lifted" };
  }
  return null;
}
