import type { DeliveryOrdersReader } from "../channels/commerce/index.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import {
  DeliveryRoundNotFoundError,
  VehicleInactiveOnDayError,
} from "../domain/errors/delivery-round-errors.js";
import type { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import type { VehicleRepository } from "../domain/ports/vehicle.repository.js";
import { loadVehicle } from "./vehicle-support.js";

/**
 * Les gardes que plusieurs gestes de la composition partagent.
 */

/**
 * Charge une tournée et vérifie la version présentée par l'écran.
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 */
export async function loadRoundAt(
  rounds: DeliveryRoundRepository,
  id: string,
  version: number,
): Promise<DeliveryRound> {
  const round = await rounds.load(id);
  if (round === null) {
    throw new DeliveryRoundNotFoundError(id);
  }
  round.ensureVersion(version);
  return round;
}

/**
 * Une tournée ne reçoit d'arrêt que si son véhicule roule ce jour-là (C14) —
 * vérifié au moment du geste : le véhicule a pu être retiré depuis
 * l'ouverture.
 *
 * @throws {VehicleNotFoundError} @throws {VehicleInactiveOnDayError}
 */
export async function ensureRoundVehicleActive(
  vehicles: VehicleRepository,
  round: DeliveryRound,
): Promise<void> {
  const vehicle = await loadVehicle(vehicles, round.vehicleId);
  if (!vehicle.activeOn(round.serviceDay)) {
    throw new VehicleInactiveOnDayError(vehicle.name, round.serviceDay);
  }
}

/** Le numéro de chaque commande que le commerce connaît encore — de quoi les citer au journal. */
export async function referencesOf(
  orders: DeliveryOrdersReader,
  orderIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const found = await orders.byIds(orderIds);
  return new Map(found.map((order) => [order.orderId, order.reference]));
}
