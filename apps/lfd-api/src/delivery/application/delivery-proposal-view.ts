import type {
  DeliveryProposalMode,
  DeliveryProposedRoundView,
  DeliveryRoundProposalView,
  DeliveryRoutingSettingsView,
} from "@lfd/contracts";

import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { Proposal, ProposedTour } from "../domain/services/propose-rounds.js";
import type { TimeWindow } from "../domain/services/route-timing.js";
import { clockTimeOf } from "../domain/value-objects/clock-time.js";
import type { KeptRound } from "./delivery-proposal-support.js";
import type { LocatedDeparture, LocatedStop } from "./delivery-routing-support.js";

const SECONDS_PER_MINUTE = 60;

/** Ce que la vue de la proposition assemble. */
export interface ProposalViewInputs {
  readonly day: string;
  readonly mode: DeliveryProposalMode;
  readonly departure: LocatedDeparture;
  readonly settings: DeliveryRoutingSettingsView;
  readonly proposal: Proposal;
  readonly rounds: readonly RoundRow[];
  readonly kept: readonly KeptRound[];
  /** Tous les arrêts considérés, situés ou non, par commande. */
  readonly stops: ReadonlyMap<string, LocatedStop>;
  /** Les commandes non situées, dans l'ordre où on les a lues. */
  readonly unlocated: readonly LocatedStop[];
}

/**
 * **La proposition, pour l'écran** (L7-C6) : des heures `HH:MM`, des minutes,
 * des mètres entiers — et les versions de TOUTES les tournées du jour, à
 * renvoyer telles quelles à l'application.
 */
export function proposalViewOf(inputs: ProposalViewInputs): DeliveryRoundProposalView {
  const reference = (orderId: string): string => inputs.stops.get(orderId)?.reference ?? "";
  return {
    day: inputs.day,
    estimate: "crow_flies",
    mode: inputs.mode,
    departurePoint: {
      pickupAddressId: inputs.departure.pickupAddressId,
      label: inputs.departure.label,
      gps: { lat: inputs.departure.point.lat, lng: inputs.departure.point.lng },
    },
    settings: inputs.settings,
    rounds: inputs.proposal.tours.map((tour) => roundView(tour, reference)),
    unlocated: inputs.unlocated.map((stop) => ({
      orderId: stop.orderId,
      reference: stop.reference,
      reason: stop.unlocated ?? "not_geocoded",
    })),
    overflow: inputs.proposal.overflow.map((orderId) => ({
      orderId,
      reference: reference(orderId),
    })),
    kept: inputs.kept.map(({ round, reason }) => ({
      roundId: round.id,
      vehicleName: round.vehicleName,
      passage: round.passage,
      reason,
    })),
    versions: inputs.rounds.map((round) => ({ roundId: round.id, version: round.version })),
  };
}

function roundView(
  tour: ProposedTour,
  reference: (orderId: string) => string,
): DeliveryProposedRoundView {
  return {
    roundId: tour.roundId,
    vehicleId: tour.vehicleId,
    vehicleName: tour.vehicleName,
    passage: tour.rank,
    departureTime: clockTimeOf(tour.timed.departure / SECONDS_PER_MINUTE),
    returnTime: clockTimeOf(tour.timed.return / SECONDS_PER_MINUTE),
    meters: Math.round(tour.timed.meters),
    minutes: Math.round((tour.timed.return - tour.timed.departure) / SECONDS_PER_MINUTE),
    overDuration: tour.overDuration,
    stops: tour.stops.map((stop, index) => ({
      orderId: stop.id,
      reference: reference(stop.id),
      arrival: clockTimeOf((tour.timed.arrivals[index] ?? 0) / SECONDS_PER_MINUTE),
      window: windowView(stop.window),
      windowMissed: tour.timed.missed[index] ?? false,
    })),
  };
}

function windowView(window: TimeWindow | null): { start: string | null; end: string } | null {
  if (window === null) {
    return null;
  }
  return {
    start: window.start === null ? null : clockTimeOf(window.start / SECONDS_PER_MINUTE),
    end: clockTimeOf(window.end / SECONDS_PER_MINUTE),
  };
}
