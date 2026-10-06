import type { BinType } from "../entities/bin-type.js";
import type { Vehicle } from "../entities/vehicle.js";
import {
  LastActiveBinTypeError,
  LastMeasuredVehicleError,
  type MeasuredVehicleGesture,
  NoActiveBinTypeError,
  NoMeasuredVehicleError,
} from "../errors/delivery-composition-errors.js";

/**
 * **Le socle de la composition** (plan de composition automatique, CA-D3) :
 * au moins un véhicule en service qui a ses cotes, et au moins un type de bac
 * en service. La règle porte sur la flotte et le catalogue ENTIERS, pas sur un
 * agrégat : elle vit donc ici, et reçoit ce que les ports en lisent.
 *
 * Deux faces. « Proposer » refuse sans le socle ; et aucun geste ne le défait
 * quand il existe. Une flotte déjà vide (en production avant CA1) n'est pas
 * réécrite : elle refuse de proposer, et rien d'autre ne change pour elle.
 */

/** Ce qui manque au socle ; le véhicule d'abord, comme le refus de « Proposer ». */
export type CompositionGap = "no_measured_vehicle" | "no_active_bin_type";

/** Ce que les deux ports ont lu du socle. */
export interface CompositionBase {
  readonly measuredVehicleIds: readonly string[];
  readonly activeBinTypeIds: readonly string[];
}

/**
 * La même règle que `ensureComposable`, dite sans lever : pour qui doit
 * l'ANNONCER (la cloche du plan arrêté, l'écran des tournées, CA6a) plutôt
 * que refuser un geste.
 */
export function compositionGapOf(input: CompositionBase): CompositionGap | null {
  if (input.measuredVehicleIds.length === 0) {
    return "no_measured_vehicle";
  }
  return input.activeBinTypeIds.length === 0 ? "no_active_bin_type" : null;
}

/** @throws {NoMeasuredVehicleError} @throws {NoActiveBinTypeError} */
export function ensureComposable(input: CompositionBase): void {
  const gap = compositionGapOf(input);
  if (gap === "no_measured_vehicle") {
    throw new NoMeasuredVehicleError();
  }
  if (gap === "no_active_bin_type") {
    throw new NoActiveBinTypeError();
  }
}

/**
 * Appelée APRÈS la mutation de `vehicle` : s'il était mesuré et ne l'est plus
 * (retiré, ou cotes effacées), un autre véhicule mesuré doit rester.
 * `measuredIds` est l'état lu AVANT la mutation.
 *
 * @throws {LastMeasuredVehicleError}
 */
export function ensureMeasuredVehicleRemains(input: {
  readonly vehicle: Vehicle;
  readonly wasMeasured: boolean;
  readonly measuredIds: readonly string[];
  readonly gesture: MeasuredVehicleGesture;
}): void {
  const { vehicle } = input;
  if (!input.wasMeasured || vehicle.measured) {
    return;
  }
  if (input.measuredIds.some((id) => id !== vehicle.id)) {
    return;
  }
  throw new LastMeasuredVehicleError(vehicle.name, input.gesture);
}

/**
 * Appelée AVANT d'archiver `binType` : s'il est en service, un autre type en
 * service doit rester. Un type déjà archivé passe — son propre refus le dira.
 *
 * @throws {LastActiveBinTypeError}
 */
export function ensureActiveBinTypeRemains(binType: BinType, activeIds: readonly string[]): void {
  if (!binType.inService || activeIds.some((id) => id !== binType.id)) {
    return;
  }
  throw new LastActiveBinTypeError(binType.name);
}
