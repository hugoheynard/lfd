import type { ApplyDeliveryProposalPayload } from "@lfd/contracts";

import type { DeliveryOrdersReader } from "../channels/commerce/index.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import type { Vehicle } from "../domain/entities/vehicle.js";
import {
  DeliveryRoundNotFoundError,
  OrderAlreadyInRoundError,
  OrderNotAssignableError,
} from "../domain/errors/delivery-round-errors.js";
import { ProposalOutdatedError } from "../domain/errors/delivery-routing-errors.js";
import type { BroughtBackOrdersReader } from "../domain/ports/brought-back-orders.reader.js";
import type { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import type { DeliveryRoundsReader } from "../domain/ports/delivery-rounds.reader.js";
import type { VehicleRepository } from "../domain/ports/vehicle.repository.js";
import type { AppliedRound } from "../domain/services/apply-proposal.js";
import { loadVehicle } from "./vehicle-support.js";

/** Les gardes d'« Appliquer » (plan de tournée, lot 7, L7-C6, L7-C11). */

/**
 * Charge les tournées que la proposition touche — celles qu'elle nomme, et
 * celles du jour qui portent une de ses commandes — et vérifie la version que
 * l'écran a lue avec la proposition.
 *
 * @throws {DeliveryRoundNotFoundError}
 * @throws {ProposalOutdatedError} une version absente ou dépassée.
 */
export async function loadTouchedRounds(
  rounds: DeliveryRoundRepository,
  reader: DeliveryRoundsReader,
  payload: ApplyDeliveryProposalPayload,
): Promise<ReadonlyMap<string, DeliveryRound>> {
  const dayRounds = await reader.roundsOn(payload.day);
  const proposed = new Set(payload.rounds.flatMap((item) => item.orderIds));
  const ids = new Set([
    ...payload.rounds.flatMap((item) => item.roundId ?? []),
    ...dayRounds
      .filter((round) => round.stops.some((stop) => proposed.has(stop.orderId)))
      .map((round) => round.id),
  ]);
  const versions = new Map(payload.versions.map((entry) => [entry.roundId, entry.version]));
  const loaded = new Map<string, DeliveryRound>();
  for (const id of [...ids].sort()) {
    const round = await rounds.load(id);
    if (round === null) {
      throw new DeliveryRoundNotFoundError(id);
    }
    if (round.serviceDay !== payload.day) {
      throw new ProposalOutdatedError(
        `la tournée « ${round.vehicleName} » n'est pas du ${payload.day}`,
      );
    }
    if (versions.get(id) !== round.loadedVersion) {
      throw new ProposalOutdatedError(`la tournée « ${round.vehicleName} » a changé`);
    }
    loaded.set(id, round);
  }
  return loaded;
}

/**
 * Les commandes que la proposition PLACE pour la première fois doivent être
 * des livraisons attendues ce jour-là, non annulées, et dans aucune tournée
 * vivante d'un autre jour (I3). Une commande RAPPORTÉE n'est plus tenue à
 * son jour demandé (lot RL1). Rend leur numéro, pour le journal.
 *
 * @throws {OrderNotAssignableError} @throws {OrderAlreadyInRoundError}
 */
export async function ensureNewOrdersAssignable(
  orders: DeliveryOrdersReader,
  rounds: DeliveryRoundRepository,
  broughtBack: BroughtBackOrdersReader,
  day: string,
  orderIds: readonly string[],
): Promise<void> {
  const [known, anyDay] = await Promise.all([
    orders.byIds(orderIds),
    broughtBack.lastAmong(orderIds),
  ]);
  const facts = new Map(known.map((order) => [order.orderId, order]));
  for (const orderId of orderIds) {
    const order = facts.get(orderId);
    const reference = order?.reference ?? orderId;
    if (order === undefined) {
      throw new OrderNotAssignableError(reference, day, "unknown");
    }
    if (order.status === "cancelled") {
      throw new OrderNotAssignableError(reference, day, "cancelled");
    }
    if (!order.delivery) {
      throw new OrderNotAssignableError(reference, day, "not_delivery");
    }
    if (order.day !== day && !anyDay.has(orderId)) {
      throw new OrderNotAssignableError(reference, day, "not_this_day");
    }
    const holder = await rounds.liveHolderOf(orderId);
    if (holder !== null) {
      throw new OrderAlreadyInRoundError(reference, holder);
    }
  }
}

/** Les véhicules des tournées à ouvrir, et le prochain passage de chacun ce jour-là. */
export async function openingsOf(
  vehicles: VehicleRepository,
  rounds: DeliveryRoundRepository,
  payload: ApplyDeliveryProposalPayload,
): Promise<ReadonlyMap<string, { readonly vehicle: Vehicle; readonly nextPassage: number }>> {
  const ids = [
    ...new Set(payload.rounds.flatMap((item) => (item.roundId === null ? [item.vehicleId] : []))),
  ];
  const openings = new Map<string, { readonly vehicle: Vehicle; readonly nextPassage: number }>();
  for (const id of ids.sort()) {
    openings.set(id, {
      vehicle: await loadVehicle(vehicles, id),
      nextPassage: await rounds.nextPassage(payload.day, id),
    });
  }
  return openings;
}

/** Les tournées que l'application a VRAIMENT changées : ouvertes, ou dont la liste a bougé. */
export function changedRounds(applied: readonly AppliedRound[]): readonly AppliedRound[] {
  return applied.filter(
    ({ round, before, opened }) =>
      opened ||
      before.length !== round.orderIds.length ||
      before.some((orderId, index) => round.orderIds[index] !== orderId),
  );
}
