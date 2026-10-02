import type {
  DeliveryPackingRoundsView,
  DeliveryPackingRoundView,
  DeliveryPackingStopView,
} from "@lfd/contracts";

import type { StopPlace } from "../domain/entities/shared-bin.js";
import type { LoadingRoundRow, LoadingStopRow } from "../domain/ports/delivery-loading.reader.js";
import { binToRedo, type OrderNames } from "./delivery-loading-view.js";

/** Ce que la vue lit d'ailleurs que des tournées. */
export interface PackingRoundsContext {
  readonly names: ReadonlyMap<string, OrderNames>;
  /** Où est l'arrêt vivant de chaque commande citée par un bac — pour « à refaire ». */
  readonly places: ReadonlyMap<string, StopPlace>;
  /** Les commandes prêtes au sens du commerce. */
  readonly ready: ReadonlySet<string>;
}

/**
 * **Les tournées d'un jour, vues du poste de colisage**
 * (`decisions-par-defaut-2026-10-02.md`, lot PC2) : les arrêts du DERNIER au
 * premier — l'ordre dans lequel les bacs entrent dans le véhicule —, et
 * « n prêtes sur m » compté ici, pas à l'écran.
 */
export function packingRoundsView(
  day: string,
  rounds: readonly LoadingRoundRow[],
  context: PackingRoundsContext,
): DeliveryPackingRoundsView {
  return { day, rounds: rounds.map((round) => packingRoundView(round, context)) };
}

function packingRoundView(
  round: LoadingRoundRow,
  context: PackingRoundsContext,
): DeliveryPackingRoundView {
  const stops = round.stops.map((stop) => packingStopView(stop, context));
  return {
    roundId: round.id,
    vehicleName: round.vehicleName,
    passage: round.passage,
    departedAt: round.departedAt?.toISOString() ?? null,
    stopCount: stops.length,
    readyStops: stops.filter((stop) => stop.ready).length,
    stops: [...stops].sort((left, right) => right.position - left.position),
  };
}

function packingStopView(
  stop: LoadingStopRow,
  context: PackingRoundsContext,
): DeliveryPackingStopView {
  return {
    orderId: stop.orderId,
    reference: context.names.get(stop.orderId)?.reference ?? "",
    position: stop.position,
    ready: context.ready.has(stop.orderId),
    binToRedo: stop.bins.some((bin) => binToRedo(bin, context.places)),
  };
}
