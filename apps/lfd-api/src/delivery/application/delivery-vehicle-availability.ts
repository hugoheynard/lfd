import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { BusyRound } from "../domain/services/vehicle-availability.js";
import type { KeptRound } from "./delivery-proposal-support.js";
import { type LocatedStop, routingStopFor } from "./delivery-routing-support.js";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** Ce qui occupe la flotte pendant « Proposer » (lot 7 ter, L7t-C2). */
export interface FleetOccupation {
  /** Les tournées gardées chargées ou parties, à chronométrer (`busyStarts`). */
  readonly busy: readonly BusyRound[];
  /**
   * Les véhicules dont une tournée chargée ou partie porte un arrêt NON
   * SITUÉ : on ne sait pas quand ils reviennent.
   */
  readonly unknownReturn: ReadonlySet<string>;
}

/**
 * **Ce qui occupe chaque camionnette** (L7t-C2) : ses tournées gardées
 * chargées ou parties — pas les autres gardées, qu'on n'a simplement pas
 * demandé de recomposer.
 *
 * 🔴 **Un arrêt non situé dans une tournée chargée ou partie écarte son
 * véhicule de la proposition** (choix du 2026-09-29) : sans point, on ne
 * chronomètre pas son retour, et toute heure « libre à » serait inventée. Le
 * travail va aux autres camionnettes ; ce qui ne tient nulle part déborde,
 * signalé. Situer l'arrêt (« Situer les arrêts », ou le carnet) rend le
 * véhicule. L'hypothèse inverse — le supposer libre, ou libre après la durée
 * maximale — pourrait promettre à un client une camionnette encore sur la
 * route.
 */
export function fleetOccupationOf(
  kept: readonly KeptRound[],
  stops: ReadonlyMap<string, LocatedStop>,
): FleetOccupation {
  const locking = kept.filter(({ reason }) => reason === "loaded" || reason === "departed");
  const unknownReturn = new Set(
    locking
      .filter(({ round }) =>
        round.stops.some((stop) => (stops.get(stop.orderId)?.point ?? null) === null),
      )
      .map(({ round }) => round.vehicleId),
  );
  const busy = locking
    .filter(({ round }) => !unknownReturn.has(round.vehicleId))
    .map(({ round }) => busyRoundOf(round, stops));
  return { busy, unknownReturn };
}

function busyRoundOf(round: RoundRow, stops: ReadonlyMap<string, LocatedStop>): BusyRound {
  return {
    roundId: round.id,
    vehicle: { id: round.vehicleId, name: round.vehicleName },
    passage: round.passage,
    stops: round.stops.map((stop) => routingStopFor(stop.orderId, stops)),
    departedAt: round.departedAt === null ? null : parisSecondsOfDay(round.departedAt),
  };
}

const PARIS_TIME = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** L'heure de Paris d'un instant, en secondes depuis minuit. */
export function parisSecondsOfDay(instant: Date): number {
  const parts = PARIS_TIME.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  return part("hour") * SECONDS_PER_HOUR + part("minute") * SECONDS_PER_MINUTE + part("second");
}
