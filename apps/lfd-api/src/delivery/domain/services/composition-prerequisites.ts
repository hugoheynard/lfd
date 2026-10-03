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

/** @throws {NoMeasuredVehicleError} @throws {NoActiveBinTypeError} */
export function ensureComposable(input: {
  readonly measuredVehicleIds: readonly string[];
  readonly activeBinTypeIds: readonly string[];
}): void {
  if (input.measuredVehicleIds.length === 0) {
    throw new NoMeasuredVehicleError();
  }
  if (input.activeBinTypeIds.length === 0) {
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
