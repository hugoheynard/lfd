import { compareIds } from "./compare-ids.js";
import type { PlanningContext } from "./proposal.js";
import type { VehiclePlan } from "./vehicle-plan.js";

/**
 * Chaque arrêt ne se rapproche que de ses DIX plus proches voisins (liste
 * granulaire) : c'est ce qui tient soixante arrêts dans le budget du test de
 * charge — 3 s de processeur, relâché de 2 s le 2026-10-05 sur décision de
 * Hugo : la CI ne tenait plus 2 s depuis le départ à rebours (CA2), et 2 s
 * reste la promesse de L7b-C2 (`__tests__/propose-rounds-scale.spec.ts`,
 * vérifié le 2026-10-07).
 * Un geste qui colle deux arrêts éloignés n'améliore presque jamais une
 * tournée, et le chercher coûte le carré du nombre d'arrêts.
 */
const NEIGHBOUR_COUNT = 10;

/** Ce qu'un voisinage a le droit de faire. */
export interface MoveScope {
  /** Les arrêts placés à la main (mode `insert`) : ils ne bougent jamais. */
  readonly pinned: ReadonlySet<string>;
  /** Seulement les gestes qui passent d'un véhicule à l'autre. */
  readonly crossOnly: boolean;
  /**
   * Deux arrêts (ou un arrêt et le départ, `null`) sont-ils assez proches pour
   * qu'un geste les rende voisins ?
   */
  readonly near: (a: string | null, b: string | null) => boolean;
}

/**
 * La liste granulaire : pour chaque arrêt, ses plus proches voisins en temps
 * aller + retour, égalités départagées par l'identifiant — déterministe. Le
 * départ est voisin de tout le monde : ouvrir ou fermer une tournée par un
 * arrêt est toujours permis.
 */
export function nearnessOf(
  ctx: PlanningContext,
  plans: readonly VehiclePlan[],
): (a: string | null, b: string | null) => boolean {
  const ids = plans
    .flatMap((plan) => plan.routes.flatMap((route) => route.stops.map((stop) => stop.id)))
    .sort(compareIds);
  const both = (a: string, b: string): number => ctx.cost.seconds(a, b) + ctx.cost.seconds(b, a);
  // La relation est symétrique : chaque arrêt porte ses voisins ET ceux qui
  // le comptent parmi les leurs — une seule lecture par question.
  const neighbours = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const id of ids) {
    const closest = ids
      .filter((other) => other !== id)
      .sort((x, y) => both(id, x) - both(id, y) || compareIds(x, y))
      .slice(0, NEIGHBOUR_COUNT);
    for (const other of closest) {
      neighbours.get(id)?.add(other);
      neighbours.get(other)?.add(id);
    }
  }
  return (a, b) => a === null || b === null || neighbours.get(a)?.has(b) === true;
}
