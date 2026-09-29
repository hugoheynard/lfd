import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { type PlannableStop, proposeRounds } from "../propose-rounds.js";
import type { CostFn } from "../../ports/distance-matrix.js";
import { planeCost } from "./line-cost.js";

const STOP_COUNT = 60;
const HOUR = 3600;
/** L7b-C2 : borné à 2 s pour 60 arrêts. */
const BUDGET_MS = 2000;
const MICROSECONDS_PER_MS = 1000;

/**
 * Le temps PROCESSEUR du calcul, pas l'horloge murale : les suites tournent en
 * parallèle, et un worker qui attend son tour ne calcule pas — mesuré au mur,
 * le même calcul passait de 0,2 s seul à plus de 1 s sous charge.
 */
function cpuMillisecondsOf(run: () => void): number {
  const before = process.cpuUsage();
  run();
  const spent = process.cpuUsage(before);
  return (spent.user + spent.system) / MICROSECONDS_PER_MS;
}

/**
 * Soixante arrêts répartis sans aléa (une spirale), créneaux de deux heures
 * étagés entre 6 h et 12 h, un sur quatre sans créneau.
 */
function spiral(): { readonly stops: readonly PlannableStop[]; readonly cost: CostFn } {
  const positions: Record<string, readonly [number, number]> = { depot: [0, 0] };
  const stops: PlannableStop[] = [];
  for (let index = 0; index < STOP_COUNT; index += 1) {
    const id = `s${String(index).padStart(2, "0")}`;
    const radius = 5 + (index % 7) * 4;
    const angle = index * 2.4;
    positions[id] = [radius * Math.cos(angle), radius * Math.sin(angle)];
    const start = (6 + (index % 5)) * HOUR;
    stops.push({
      id,
      window: index % 4 === 0 ? null : { start, end: start + 2 * HOUR },
      homeRoundId: null,
    });
  }
  return { stops, cost: tabulated(planeCost(positions), Object.keys(positions)) };
}

/**
 * La matrice calculée d'avance et lue par index, comme la rend l'adaptateur
 * OSRM : c'est le calcul qu'on chronomètre, pas une hypoténuse par case.
 */
function tabulated(cost: CostFn, ids: readonly string[]): CostFn {
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

describe("proposer à l'échelle (L7b-C2)", () => {
  it("rend soixante arrêts sur quatre véhicules en moins de deux secondes, sans rien perdre", () => {
    const { stops, cost } = spiral();
    let proposal: ReturnType<typeof proposeRounds> = { tours: [], overflow: [] };

    const spent = cpuMillisecondsOf(() => {
      proposal = proposeRounds({
        depotId: "depot",
        stops,
        vehicles: ["v1", "v2", "v3", "v4"].map((id) => ({ id, name: id })),
        recomposable: [],
        cost,
        settings: RoutingSettings.defaults(),
      });
    });

    expect(spent).toBeLessThan(BUDGET_MS);
    const placed = proposal.tours.flatMap((tour) => tour.stops.map((stop) => stop.id));
    expect(placed.length + proposal.overflow.length).toBe(STOP_COUNT);
    expect(new Set(placed).size).toBe(placed.length);
  });
});
