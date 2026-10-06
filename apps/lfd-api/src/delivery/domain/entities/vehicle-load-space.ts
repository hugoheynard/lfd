import { RefrigeratedVolumeExceedsCargoError } from "../errors/delivery-errors.js";
import {
  InvalidWheelArchesError,
  WheelArchesWithoutCargoError,
} from "../errors/delivery-floor-errors.js";
import { CargoFloor } from "../value-objects/cargo-floor.js";
import { CargoSpace } from "../value-objects/cargo-space.js";
import { RefrigeratedCompartment } from "../value-objects/refrigerated-compartment.js";
import type { MeasuredWheelArches, WheelArches } from "../value-objects/wheel-arches.js";
import { type VehicleEnergy, vehicleEnergyOf } from "../value-objects/vehicle-energy.js";
import type { VehicleIdentity } from "./vehicle.js";

/** Le chargement d'un véhicule et son énergie, validés — ses parties et la règle qui les lie. */
export interface LoadSpace {
  readonly cargo: CargoSpace | null;
  readonly wheelArches: WheelArches | null;
  readonly refrigeration: RefrigeratedCompartment | null;
  readonly energy: VehicleEnergy | null;
}

/**
 * Les passages de roue n'existent que sur un plancher connu : `CargoFloor` les
 * confronte à sa largeur et à sa longueur (G-D2).
 *
 * @throws {WheelArchesWithoutCargoError} @throws {InvalidWheelArchesError}
 */
function wheelArchesOf(
  cargo: CargoSpace | null,
  input: MeasuredWheelArches | null | undefined,
): WheelArches | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (cargo === null) {
    throw new WheelArchesWithoutCargoError();
  }
  const arches = CargoFloor.of({ ...cargo.toDimensions(), wheelArches: input }).wheelArches;
  // Le type exige la hauteur ; un appelant hors du contrat la refuse ici.
  if (arches?.measured() === null) {
    throw new InvalidWheelArchesError("la hauteur manque");
  }
  return arches;
}

/**
 * Valide les deux parties du chargement, puis la règle qui les lie ; l'énergie
 * suit le même chemin, parce qu'elle vit dans la même fiche complète : le volume
 * réfrigéré ne dépasse pas le volume utile quand celui-ci est connu (L2b-C2).
 *
 * @throws {InvalidCargoDimensionsError} @throws {InvalidRefrigerationError}
 * @throws {RefrigeratedVolumeExceedsCargoError} @throws {InvalidVehicleEnergyError}
 * @throws {WheelArchesWithoutCargoError} @throws {InvalidWheelArchesError}
 */
export function loadSpaceOf(
  input: Pick<VehicleIdentity, "cargo" | "wheelArches" | "refrigeration" | "energy">,
): LoadSpace {
  const cargoInput = input.cargo ?? null;
  const refrigerationInput = input.refrigeration ?? null;
  const cargo = cargoInput === null ? null : CargoSpace.of(cargoInput);
  const refrigeration =
    refrigerationInput === null ? null : RefrigeratedCompartment.of(refrigerationInput);
  if (cargo !== null && refrigeration !== null && refrigeration.volumeLiters > cargo.volumeLiters) {
    throw new RefrigeratedVolumeExceedsCargoError(refrigeration.volumeLiters, cargo.volumeLiters);
  }
  const energyInput = input.energy ?? null;
  return {
    cargo,
    wheelArches: wheelArchesOf(cargo, input.wheelArches),
    refrigeration,
    energy: energyInput === null ? null : vehicleEnergyOf(energyInput),
  };
}
