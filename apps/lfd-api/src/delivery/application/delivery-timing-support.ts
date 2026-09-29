import type { TimeDeliveryRoundsPayload } from "@lfd/contracts";

import type { DeliveryOrderFacts } from "../channels/commerce/index.js";
import {
  DeliveryRoundNotFoundError,
  OrderNotAssignableError,
} from "../domain/errors/delivery-round-errors.js";
import {
  InvalidProposalError,
  LockedRoundRecomposedError,
  StopNotLocatedError,
} from "../domain/errors/delivery-routing-errors.js";
import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { LocatedStop } from "./delivery-routing-support.js";

/** Les gardes de « Chronométrer » (plan de tournée, lot 10 bis, L10b-C2). */

type TimedRoundInput = TimeDeliveryRoundsPayload["rounds"][number];

/**
 * Chaque commande une seule fois, et une livraison attendue ce jour-là, non
 * annulée — ce qu'« Appliquer » exigera de toute façon : chronométrer une
 * composition qu'on ne pourrait pas appliquer montrerait des heures fausses.
 *
 * @throws {OrderNotAssignableError} @throws {InvalidProposalError}
 */
export function ensureOrdersTimeable(
  payload: TimeDeliveryRoundsPayload,
  facts: ReadonlyMap<string, DeliveryOrderFacts>,
): void {
  const seen = new Set<string>();
  for (const orderId of payload.rounds.flatMap((round) => round.orderIds)) {
    const order = facts.get(orderId);
    const reference = order?.reference ?? orderId;
    if (seen.has(orderId)) {
      throw new InvalidProposalError(`la commande ${reference} figure deux fois`);
    }
    seen.add(orderId);
    if (order === undefined) {
      throw new OrderNotAssignableError(reference, payload.day, "unknown");
    }
    if (order.status === "cancelled") {
      throw new OrderNotAssignableError(reference, payload.day, "cancelled");
    }
    if (!order.delivery) {
      throw new OrderNotAssignableError(reference, payload.day, "not_delivery");
    }
    if (order.day !== payload.day) {
      throw new OrderNotAssignableError(reference, payload.day, "not_this_day");
    }
  }
}

/**
 * Une tournée nommée existe ce jour-là, sur le véhicule annoncé ; une tournée
 * **partie ou chargée** garde exactement sa composition — aucun arrêt n'y
 * entre, n'en sort ni n'y change de place (I6).
 *
 * @throws {DeliveryRoundNotFoundError} @throws {InvalidProposalError}
 * @throws {LockedRoundRecomposedError}
 */
export function ensureRoundsTimeable(
  payload: TimeDeliveryRoundsPayload,
  dayRounds: readonly RoundRow[],
  loadedStopIds: ReadonlySet<string>,
): void {
  const byId = new Map(dayRounds.map((round) => [round.id, round]));
  const lockOf = (round: RoundRow): "departed" | "loaded" | null =>
    round.departedAt !== null
      ? "departed"
      : round.stops.some((stop) => loadedStopIds.has(stop.stopId))
        ? "loaded"
        : null;
  const lockedHolder = new Map<string, RoundRow>();
  for (const round of dayRounds) {
    if (lockOf(round) !== null) {
      round.stops.forEach((stop) => lockedHolder.set(stop.orderId, round));
    }
  }
  for (const item of payload.rounds) {
    const existing = item.roundId === null ? null : namedRound(byId, item);
    const lock = existing === null ? null : lockOf(existing);
    if (existing !== null && lock !== null) {
      if (!sameSequence(existing, item.orderIds)) {
        throw new LockedRoundRecomposedError(existing.vehicleName, lock);
      }
      continue;
    }
    const taken = item.orderIds.map((id) => lockedHolder.get(id)).find((r) => r !== undefined);
    if (taken !== undefined) {
      throw new LockedRoundRecomposedError(taken.vehicleName, lockOf(taken) ?? "loaded");
    }
  }
}

function namedRound(byId: ReadonlyMap<string, RoundRow>, item: TimedRoundInput): RoundRow {
  const round = item.roundId === null ? undefined : byId.get(item.roundId);
  if (round === undefined) {
    throw new DeliveryRoundNotFoundError(item.roundId ?? "");
  }
  if (round.vehicleId !== item.vehicleId) {
    throw new InvalidProposalError(
      `la tournée « ${round.vehicleName} » est annoncée sur un autre véhicule`,
    );
  }
  return round;
}

function sameSequence(round: RoundRow, orderIds: readonly string[]): boolean {
  return (
    round.stops.length === orderIds.length &&
    round.stops.every((stop, index) => stop.orderId === orderIds[index])
  );
}

/**
 * Chaque arrêt a un point : on ne chronomètre pas un trajet vers nulle part.
 *
 * @throws {StopNotLocatedError}
 */
export function ensureStopsLocated(
  orderIds: readonly string[],
  stops: ReadonlyMap<string, LocatedStop>,
): void {
  for (const orderId of orderIds) {
    const stop = stops.get(orderId);
    if (stop?.point == null) {
      throw new StopNotLocatedError(stop?.reference ?? orderId);
    }
  }
}
