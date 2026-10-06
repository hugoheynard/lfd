import type {
  DeliveryProposalMode,
  DeliveryProposalWindow,
  DeliveryProposedRoundView,
  DeliveryRoundProposalView,
  DeliveryRoutingSettingsView,
  DeliveryTimedRoundView,
} from "@lfd/contracts";

import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { RouteLine } from "../domain/ports/route-geometry.js";
import type { Proposal, ProposedTour } from "../domain/services/proposal.js";
import type { TimeWindow } from "../domain/services/route-timing.js";
import { clockTimeOf } from "../domain/value-objects/clock-time.js";
import type { KeptRound } from "./delivery-proposal-support.js";
import type { LocatedDeparture, LocatedStop } from "./delivery-routing-support.js";
import type { DefaultedDemand } from "./proposal-capacity.js";

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
  /** Les commandes considérées dont on ne connaît pas les bacs (2026-10-06). */
  readonly unknownDemand: readonly string[];
  /** Les commandes comptées au contenant par défaut, et ce qu'elles occupent (2026-10-06). */
  readonly defaultDemand: readonly (DefaultedDemand & { readonly orderId: string })[];
  /** Le tracé de chaque tournée de `proposal.tours`, dans le même ordre (L10b-C4). */
  readonly lines: readonly (RouteLine | null)[];
}

/**
 * `estimate` du contrat, figé : sans calcul routier, on refuse (L10b-C5). Le
 * champ reste rendu tant qu'un écran en ligne le lit.
 */
export const ROAD_ESTIMATE = "road";

/**
 * **La proposition, pour l'écran** (L7-C6) : des heures `HH:MM`, des minutes,
 * des mètres entiers — et les versions de TOUTES les tournées du jour, à
 * renvoyer telles quelles à l'application.
 */
export function proposalViewOf(inputs: ProposalViewInputs): DeliveryRoundProposalView {
  const reference = (orderId: string): string => inputs.stops.get(orderId)?.reference ?? "";
  return {
    day: inputs.day,
    estimate: ROAD_ESTIMATE,
    mode: inputs.mode,
    departurePoint: {
      pickupAddressId: inputs.departure.pickupAddressId,
      label: inputs.departure.label,
      gps: { lat: inputs.departure.point.lat, lng: inputs.departure.point.lng },
    },
    settings: inputs.settings,
    rounds: inputs.proposal.tours.map((tour, index) =>
      proposedRoundView(tour, reference, inputs.lines[index] ?? null),
    ),
    unlocated: inputs.unlocated.map((stop) => ({
      orderId: stop.orderId,
      reference: stop.reference,
      reason: stop.unlocated ?? "not_geocoded",
    })),
    overflow: inputs.proposal.overflow.map((orderId) => ({
      orderId,
      reference: reference(orderId),
    })),
    unfit: inputs.proposal.capacityRefused.map((orderId) => ({
      orderId,
      reference: reference(orderId),
      reason: "capacity" as const,
    })),
    unknownDemand: inputs.unknownDemand.map((orderId) => ({
      orderId,
      reference: reference(orderId),
    })),
    defaultDemand: inputs.defaultDemand.map((demand) => ({
      orderId: demand.orderId,
      reference: reference(demand.orderId),
      binTypeName: demand.binTypeName,
      count: demand.count,
      withEstimate: demand.withEstimate,
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

/** Une tournée proposée ou chronométrée, pour l'écran : partagée avec « Chronométrer » (lot 10 bis). */
export function proposedRoundView(
  tour: ProposedTour,
  reference: (orderId: string) => string,
  line: RouteLine | null,
): DeliveryProposedRoundView {
  return {
    roundId: tour.roundId,
    vehicleId: tour.vehicleId,
    vehicleName: tour.vehicleName,
    ...tourTimesView(tour),
    stops: tour.stops.map((stop, index) => ({
      orderId: stop.id,
      reference: reference(stop.id),
      ...stopTimesView(tour, index),
    })),
    geometry: line,
  };
}

/**
 * Une tournée de la composition chronométrée (CA5) : la vue d'une tournée
 * proposée, chaque arrêt dit en plus si sa PLACE le rend intenable.
 */
export function timedRoundView(
  tour: ProposedTour,
  reference: (orderId: string) => string,
  line: RouteLine | null,
  placementLate: ReadonlySet<string>,
): DeliveryTimedRoundView {
  const view = proposedRoundView(tour, reference, line);
  return {
    ...view,
    stops: view.stops.map((stop) => ({ ...stop, placementLate: placementLate.has(stop.orderId) })),
  };
}

/** Ce qu'une tournée proposée dit de son horaire, à l'écran : partagé avec le simulateur (lot 9). */
export interface TourTimesView {
  readonly passage: number;
  readonly departureTime: string;
  readonly returnTime: string;
  readonly meters: number;
  readonly minutes: number;
  readonly overDuration: boolean;
}

export function tourTimesView(tour: ProposedTour): TourTimesView {
  return {
    passage: tour.rank,
    departureTime: clockTimeOf(tour.timed.departure / SECONDS_PER_MINUTE),
    returnTime: clockTimeOf(tour.timed.return / SECONDS_PER_MINUTE),
    meters: Math.round(tour.timed.meters),
    minutes: Math.round((tour.timed.return - tour.timed.departure) / SECONDS_PER_MINUTE),
    overDuration: tour.overDuration,
  };
}

/** L'arrivée au `index`-ième arrêt, sa fenêtre et si elle est manquée. */
export function stopTimesView(
  tour: ProposedTour,
  index: number,
): {
  readonly arrival: string;
  readonly window: DeliveryProposalWindow | null;
  readonly windowMissed: boolean;
} {
  return {
    arrival: clockTimeOf((tour.timed.arrivals[index] ?? 0) / SECONDS_PER_MINUTE),
    window: windowView(tour.stops[index]?.window ?? null),
    windowMissed: tour.timed.missed[index] ?? false,
  };
}

function windowView(window: TimeWindow | null): DeliveryProposalWindow | null {
  if (window === null) {
    return null;
  }
  return {
    start: window.start === null ? null : clockTimeOf(window.start / SECONDS_PER_MINUTE),
    end: clockTimeOf(window.end / SECONDS_PER_MINUTE),
  };
}
