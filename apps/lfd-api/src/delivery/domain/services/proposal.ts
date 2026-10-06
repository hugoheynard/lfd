import type { CostFn } from "../ports/distance-matrix.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";
import type { RoutingStop, TimedRoute } from "./route-timing.js";

/**
 * Les formes que partagent les deux modes de « Proposer » et le
 * chronométrage (lots 7, 7 bis, 10 bis) — ce que l'application lit du calcul.
 */

export interface PlanningVehicle {
  readonly id: string;
  readonly name: string;
}

/** Ce qu'il faut pour chronométrer : le départ, la matrice, les réglages. */
export interface PlanningContext {
  readonly depotId: string;
  readonly cost: CostFn;
  readonly settings: RoutingSettings;
}

/** Une tournée proposée, chronométrée. */
export interface ProposedTour {
  readonly roundId: string | null;
  readonly vehicleId: string;
  readonly vehicleName: string;
  /** Le rang du passage de ce véhicule dans la proposition, 1..n. */
  readonly rank: number;
  readonly stops: readonly RoutingStop[];
  readonly timed: TimedRoute;
  readonly overDuration: boolean;
}

export interface Proposal {
  readonly tours: readonly ProposedTour[];
  /** Les commandes à répartir qu'aucune tournée ne peut recevoir (plus de passage permis). */
  readonly overflow: readonly string[];
  /**
   * Les commandes qu'aucune place ne tenait dans la caisse (CA4) — à
   * répartir, ou restées dans leur tournée d'origine (« tout recomposer »).
   */
  readonly capacityRefused: readonly string[];
}
