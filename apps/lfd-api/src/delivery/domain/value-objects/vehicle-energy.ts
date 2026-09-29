import { InvalidVehicleEnergyError } from "../errors/delivery-errors.js";

/**
 * **L'énergie d'un véhicule** (lot 2 bis, L2b-C6) : `gas` = GNV ou GPL,
 * `hybrid` = hybride thermique-électrique. Affichée, pas encore lue par le
 * calcul — l'autonomie d'un électrique en montagne est une étape possible.
 *
 * Ce sont des VALEURS rangées en base (CHECK de la migration
 * `20260929223000_l_energie_d_un_vehicule`) : on en ajoute, on n'en renomme pas.
 */
export const VEHICLE_ENERGIES = ["electric", "hybrid", "diesel", "petrol", "gas"] as const;
export type VehicleEnergy = (typeof VEHICLE_ENERGIES)[number];

/** @throws {InvalidVehicleEnergyError} une valeur hors de la liste. */
export function vehicleEnergyOf(raw: string): VehicleEnergy {
  const energy = VEHICLE_ENERGIES.find((known) => known === raw);
  if (energy === undefined) {
    throw new InvalidVehicleEnergyError(raw);
  }
  return energy;
}
