import type { Vehicle } from "../entities/vehicle.js";
import type { LicensePlate } from "../value-objects/license-plate.js";

/**
 * Port d'**écriture** de la flotte : on charge l'agrégat, il se mute par ses
 * méthodes métier, on le rend.
 */
export abstract class VehicleRepository {
  abstract load(id: string): Promise<Vehicle | null>;

  /**
   * Écrit l'agrégat (création ou mise à jour).
   * @throws {LicensePlateAlreadyInServiceError} l'index partiel a refusé la
   * plaque — une course que le handler n'a pas pu voir venir.
   */
  abstract save(vehicle: Vehicle): Promise<void>;

  /**
   * Le nom du véhicule EN SERVICE qui porte cette plaque, hors `exceptId` ;
   * `null` si aucun. Lu avant d'écrire, pour que le refus nomme le véhicule —
   * après un échec d'index, la transaction est perdue et ne peut plus le dire.
   */
  abstract inServiceHolderOf(plate: LicensePlate, exceptId: string | null): Promise<string | null>;
}
