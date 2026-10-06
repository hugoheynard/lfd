import type {
  DeliveryOrderFacts,
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
} from "../channels/commerce/index.js";
import type { BroughtBackOrdersReader } from "../domain/ports/brought-back-orders.reader.js";
import type { DeliveryRoundsReader, RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { GeocodeCacheReader } from "../domain/ports/geocode-cache.reader.js";
import type { LoadedStopsReader } from "../domain/ports/loaded-stops.reader.js";
import { ordersToReplace } from "./brought-back-support.js";
import { locateFromCache, type LocatedStop } from "./delivery-routing-support.js";

/** Ce que la proposition a lu du jour. */
export interface ProposalDayReading {
  readonly rounds: readonly RoundRow[];
  /**
   * À répartir : EN TÊTE les rapportées à replacer, de n'importe quel jour
   * (lot RL1 bis), puis les attendues ce jour, actives, dans aucune tournée
   * vivante. Chaque commande une seule fois.
   */
  readonly unassigned: readonly string[];
  readonly loadedStopIds: ReadonlySet<string>;
  /** Les commandes composées, relues par leur id : de quoi voir un arrêt signalé. */
  readonly facts: ReadonlyMap<string, DeliveryOrderFacts>;
  /** Parmi les commandes composées, celles qui ont été rapportées un jour : jamais `not_this_day`. */
  readonly broughtBack: ReadonlySet<string>;
}

/** Les ports que la lecture du jour traverse. */
export interface ProposalDayPorts {
  readonly rounds: DeliveryRoundsReader;
  readonly orders: DeliveryOrdersReader;
  readonly loadedStops: LoadedStopsReader;
  readonly broughtBack: BroughtBackOrdersReader;
  readonly states: DeliveryOrderStatesReader;
}

/**
 * **Ce que « Proposer » lit d'un jour** — la même règle que la composition
 * (`deliveryRoundsDayView`) : une commande rapportée et non replacée est à
 * répartir quel que soit le jour composé, et un arrêt rapporté placé un autre
 * jour que sa date demandée n'est pas « signalé » pour cette seule raison
 * (`decisions-par-defaut-2026-10-02.md`, § 4).
 */
export async function readProposalDay(
  ports: ProposalDayPorts,
  serviceDay: string,
): Promise<ProposalDayReading> {
  const [rounds, expected, awaiting] = await Promise.all([
    ports.rounds.roundsOn(serviceDay),
    ports.orders.expectedOn(serviceDay),
    ordersToReplace(ports.broughtBack, ports.orders, ports.states),
  ]);
  const active = expected.filter((order) => order.status === "active");
  const composedIds = rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
  const [assigned, loadedStopIds, facts, broughtBack] = await Promise.all([
    ports.rounds.composedAmong(active.map((order) => order.orderId)),
    ports.loadedStops.loadedAmong(rounds.flatMap((round) => round.stops.map((s) => s.stopId))),
    ports.orders.byIds(composedIds),
    ports.broughtBack.lastAmong(composedIds),
  ]);
  const awaitingIds = awaiting.map((order) => order.orderId);
  const head = new Set(awaitingIds);
  const ofDay = active
    .map((order) => order.orderId)
    .filter((orderId) => !assigned.has(orderId) && !head.has(orderId));
  return {
    rounds,
    unassigned: [...awaitingIds, ...ofDay],
    loadedStopIds,
    facts: new Map(facts.map((order) => [order.orderId, order])),
    broughtBack: new Set(broughtBack.keys()),
  };
}

/**
 * Situe les commandes à répartir et celles des tournées du jour lu — carnet,
 * puis cache, jamais le réseau. Partagé par « Proposer » et la place
 * suggérée (CA7) : les deux lisent les mêmes points.
 */
export async function locateProposalDay(
  ports: { readonly orders: DeliveryOrdersReader; readonly cache: GeocodeCacheReader },
  day: ProposalDayReading,
  now: Date,
): Promise<ReadonlyMap<string, LocatedStop>> {
  const composedIds = day.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
  const points = await ports.orders.stopPointsOf([...day.unassigned, ...composedIds]);
  const located = await locateFromCache(points, ports.cache, now);
  return new Map(located.map((stop) => [stop.orderId, stop]));
}
