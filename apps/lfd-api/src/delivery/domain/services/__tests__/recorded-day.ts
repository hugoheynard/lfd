import { UnknownCostPointError } from "../../errors/delivery-routing-errors.js";
import type { CostFn } from "../../ports/distance-matrix.js";
import type { ProposedTour } from "../proposal.js";
import type { RoutingStop } from "../route-timing.js";
import {
  RECORDED_DAY_IDS,
  RECORDED_DAY_METERS,
  RECORDED_DAY_SECONDS,
  RECORDED_DAY_STOPS,
} from "./recorded-day.fixture.js";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const METERS_PER_KM = 1000;

/** La matrice enregistrée, en `CostFn` : un identifiant inconnu lève, comme l'adaptateur. */
export function recordedCost(): CostFn {
  const index = new Map(RECORDED_DAY_IDS.map((id, position) => [id, position]));
  const cell = (table: readonly (readonly number[])[], from: string, to: string): number => {
    const row = index.get(from);
    const column = index.get(to);
    if (row === undefined) {
      throw new UnknownCostPointError(from);
    }
    if (column === undefined) {
      throw new UnknownCostPointError(to);
    }
    return table[row]?.[column] ?? 0;
  };
  return {
    meters: (from, to) => cell(RECORDED_DAY_METERS, from, to),
    seconds: (from, to) => cell(RECORDED_DAY_SECONDS, from, to),
  };
}

function secondsOf(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return ((hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0)) * SECONDS_PER_MINUTE;
}

/** Les arrêts enregistrés, créneaux en secondes depuis minuit. */
export function recordedStops(filter: (keptRound: boolean) => boolean): readonly RoutingStop[] {
  return RECORDED_DAY_STOPS.filter((stop) => filter(stop.keptRound)).map((stop) => ({
    id: stop.id,
    window:
      stop.window === null
        ? null
        : { start: secondsOf(stop.window.start), end: secondsOf(stop.window.end) },
  }));
}

/** Ce qu'on compare avant / après (L7b-C5). */
export interface DayMeasure {
  readonly tours: number;
  readonly km: number;
  readonly minutes: number;
  readonly waitMinutes: number;
  readonly lateStops: number;
  readonly singleStopTours: number;
  /** Arrêts servis dans les `marginMinutes` dernières minutes de leur créneau, sans retard (L7t-C1). */
  readonly marginStops: number;
}

/** Mesure une proposition : attente = arrivée avant l'ouverture d'un créneau, jusqu'à l'ouverture. */
export function measure(tours: readonly ProposedTour[], marginMinutes = 20): DayMeasure {
  const margin = marginMinutes * SECONDS_PER_MINUTE;
  let inMargin = 0;
  let meters = 0;
  let seconds = 0;
  let wait = 0;
  let late = 0;
  for (const tour of tours) {
    meters += tour.timed.meters;
    seconds += tour.timed.return - tour.timed.departure;
    tour.stops.forEach((stop, index) => {
      const arrival = tour.timed.arrivals[index] ?? 0;
      wait += Math.max(0, (stop.window?.start ?? arrival) - arrival);
      late += tour.timed.missed[index] === true ? 1 : 0;
      const served = Math.max(arrival, stop.window?.start ?? arrival);
      const end = stop.window?.end;
      inMargin += end !== undefined && served <= end && served > end - margin ? 1 : 0;
    });
  }
  return {
    tours: tours.length,
    km: Math.round(meters / METERS_PER_KM),
    minutes: Math.round(seconds / SECONDS_PER_MINUTE),
    waitMinutes: Math.round(wait / SECONDS_PER_MINUTE),
    lateStops: late,
    singleStopTours: tours.filter((tour) => tour.stops.length === 1).length,
    marginStops: inMargin,
  };
}
