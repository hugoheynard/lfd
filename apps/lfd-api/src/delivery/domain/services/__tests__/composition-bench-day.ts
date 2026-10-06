import type { CostFn } from "../../ports/distance-matrix.js";
import { RoutingSettings } from "../../value-objects/routing-settings.js";
import type { CompositionCapacity } from "../capacity-guard.js";
import type { InsertionInput } from "../insert-into-rounds.js";
import type { PlanningVehicle, Proposal } from "../proposal.js";
import type { PlannableStop, ProposalInput } from "../propose-rounds.js";
import { binsOf, measured } from "./capacity-fixtures.js";
import { planeCost } from "./line-cost.js";
import type { CompositionZones } from "../zone-rule.js";

/**
 * La journée du banc à 200 clients (composition-automatique.md §5 point 3) :
 * une scène TIRÉE d'une graine, identique d'une machine à l'autre, pour que
 * deux mesures ne diffèrent que par le calcul.
 *
 * Aucun générateur pseudo-aléatoire n'existait dans les tests du calculateur
 * (vérifié le 2026-10-06 : `propose-rounds-scale.spec.ts` place ses arrêts en
 * spirale, sans aléa) ; celui-ci est un mulberry32, déterministe, et
 * `Math.random()` reste interdit (`lint:clock-port`).
 */

const HOUR = 3600;
const UINT32 = 4_294_967_296;
/** Le rayon de la zone livrée, en minutes de route depuis le fournil. */
const RADIUS_MINUTES = 25;
/** L'échéance commune : « avant 12 h », le mode par défaut (§14.2). */
const COMMON_DEADLINE = 12 * HOUR;
const TIGHT_DEADLINES = 5;
const OPENING_SLOTS = 5;
/** Combien de commandes « Insérer » reçoit sur une journée déjà composée. */
export const INSERTED_COUNT = 20;
export const PASSAGES_PER_VEHICLE = 2;

/** Un tirage sur [0, 1), mulberry32. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32;
  };
}

/**
 * La matrice calculée d'avance et lue par index, comme la rend l'adaptateur
 * OSRM : c'est le calcul qu'on chronomètre, pas une hypoténuse par case.
 */
export function tabulated(cost: CostFn, ids: readonly string[]): CostFn {
  const index = new Map(ids.map((id, position) => [id, position]));
  const table = (read: (from: string, to: string) => number): readonly (readonly number[])[] =>
    ids.map((from) => ids.map((to) => read(from, to)));
  const seconds = table((from, to) => cost.seconds(from, to));
  const meters = table((from, to) => cost.meters(from, to));
  const cell = (rows: readonly (readonly number[])[], from: string, to: string): number =>
    rows[index.get(from) ?? -1]?.[index.get(to) ?? -1] ?? 0;
  return {
    seconds: (from, to) => cell(seconds, from, to),
    meters: (from, to) => cell(meters, from, to),
  };
}

/** Les dix contraintes : cinq échéances serrées (7 h–9 h), cinq créneaux qui ouvrent (9 h–11 h). */
function windowOf(index: number, random: () => number): PlannableStop["window"] {
  if (index < TIGHT_DEADLINES) {
    return { start: null, end: (7 + Math.floor(random() * 3)) * HOUR };
  }
  if (index < TIGHT_DEADLINES + OPENING_SLOTS) {
    const start = (9 + Math.floor(random() * 3)) * HOUR;
    return { start, end: start + HOUR };
  }
  return { start: null, end: COMMON_DEADLINE };
}

/** La demande : 1 bac (50 %), 2 (30 %), 3 (15 %), 5 (5 %) — un gros client par vingtaine. */
function binCountOf(draw: number): number {
  if (draw < 0.5) return 1;
  if (draw < 0.8) return 2;
  if (draw < 0.95) return 3;
  return 5;
}

const VEHICLES: readonly PlanningVehicle[] = [
  { id: "v1", name: "Trafic 1" },
  { id: "v2", name: "Trafic 2" },
  { id: "v3", name: "Kangoo 1" },
  { id: "v4", name: "Kangoo 2" },
];

export interface BenchDay {
  readonly complete: ProposalInput;
  /** La même journée sans ses vingt dernières commandes, rangées dans des tournées, à insérer. */
  readonly insertion: (composed: Proposal) => InsertionInput;
}

/**
 * Le tirage « avec zones » (2026-10-06) : la moitié nord et la moitié sud du
 * disque, chaque Kangoo restreint à une moitié, les Trafic partout. Les zones
 * se DÉDUISENT des positions déjà tirées : la scène est la même graine pour
 * graine, seule la règle change.
 */
export function zonesOf(
  positions: Readonly<Record<string, readonly [number, number]>>,
): CompositionZones {
  return {
    vehicles: new Map([
      ["v3", new Set(["north"])],
      ["v4", new Set(["south"])],
    ]),
    stops: new Map(
      Object.entries(positions).flatMap(([id, [, y]]) =>
        id === "depot" ? [] : [[id, y >= 0 ? "north" : "south"] as const],
      ),
    ),
  };
}

/** La journée de la graine `seed`, avec `stopCount` arrêts ; `zoned` : le tirage avec zones. */
export function benchDay(seed: number, stopCount: number, zoned = false): BenchDay {
  const random = seededRandom(seed);
  const positions: Record<string, readonly [number, number]> = { depot: [0, 0] };
  const stops: PlannableStop[] = [];
  const bins = new Map<string, ReturnType<typeof binsOf>>();
  for (let index = 0; index < stopCount; index += 1) {
    const id = `s${String(index).padStart(3, "0")}`;
    const radius = RADIUS_MINUTES * Math.sqrt(random());
    const angle = 2 * Math.PI * random();
    positions[id] = [radius * Math.cos(angle), radius * Math.sin(angle)];
    stops.push({ id, window: windowOf(index, random), homeRoundId: null });
    bins.set(id, binsOf(id, binCountOf(random())));
  }
  const trafic = measured("Trafic", 250, 160, 140);
  const kangoo = measured("Kangoo", 130, 125, 140);
  const capacity: CompositionCapacity = {
    vehicles: new Map([
      ["v1", trafic],
      ["v2", trafic],
      ["v3", kangoo],
      ["v4", kangoo],
    ]),
    bins,
  };
  const cost = tabulated(planeCost(positions), Object.keys(positions));
  const settings = RoutingSettings.defaults();
  const passageLimits = new Map(VEHICLES.map((vehicle) => [vehicle.id, PASSAGES_PER_VEHICLE]));
  const zones = zoned ? { zones: zonesOf(positions) } : {};
  const complete: ProposalInput = {
    depotId: "depot",
    stops,
    vehicles: VEHICLES,
    recomposable: [],
    cost,
    settings,
    passageLimits,
    capacity,
    ...zones,
  };
  const newcomers = new Set(stops.slice(-INSERTED_COUNT).map((stop) => stop.id));
  const insertion = (composed: Proposal): InsertionInput => ({
    depotId: "depot",
    cost,
    settings,
    capacity,
    ...zones,
    vehicles: VEHICLES,
    passageLimits: new Map(
      VEHICLES.map((vehicle) => [
        vehicle.id,
        Math.max(
          0,
          PASSAGES_PER_VEHICLE -
            composed.tours.filter((tour) => tour.vehicleId === vehicle.id).length,
        ),
      ]),
    ),
    stops: stops.filter((stop) => newcomers.has(stop.id)),
    rounds: composed.tours.map((tour, rank) => ({
      roundId: `r${String(rank + 1)}`,
      vehicleId: tour.vehicleId,
      vehicleName: tour.vehicleName,
      passage: tour.rank,
      stops: tour.stops.filter((stop) => !newcomers.has(stop.id)),
    })),
  });
  return { complete, insertion };
}
