import type { Vehicle } from "../domain/entities/vehicle.js";
import {
  LicensePlateAlreadyInServiceError,
  VehicleNotFoundError,
} from "../domain/errors/delivery-errors.js";
import type { VehicleRepository } from "../domain/ports/vehicle.repository.js";

/**
 * Les gardes que plusieurs cas de la flotte partagent.
 */

/** @throws {VehicleNotFoundError} */
export async function loadVehicle(vehicles: VehicleRepository, id: string): Promise<Vehicle> {
  const vehicle = await vehicles.load(id);
  if (vehicle === null) {
    throw new VehicleNotFoundError(id);
  }
  return vehicle;
}

/**
 * Refuse d'écrire un véhicule EN SERVICE dont la plaque est déjà portée par un
 * autre véhicule en service — en nommant ce dernier. Un véhicule retiré ne
 * compte pas : l'index partiel ne le voit pas non plus.
 *
 * @throws {LicensePlateAlreadyInServiceError}
 */
export async function ensurePlateFree(
  vehicles: VehicleRepository,
  vehicle: Vehicle,
): Promise<void> {
  if (!vehicle.inService) {
    return;
  }
  const holder = await vehicles.inServiceHolderOf(vehicle.plate, vehicle.id);
  if (holder !== null) {
    throw new LicensePlateAlreadyInServiceError(vehicle.plate.value, holder);
  }
}
