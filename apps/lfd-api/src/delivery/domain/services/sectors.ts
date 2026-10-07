import type { CompositionCapacity } from "./capacity-guard.js";
import { compareIds } from "./compare-ids.js";
import type { PlanningContext } from "./proposal.js";
import type { RoutingStop } from "./route-timing.js";
import type { ZoneRule } from "./zone-rule.js";

/** Combien de fois on recentre les secteurs : au-delà, ils ne bougent plus sur le banc. */
const SECTOR_ROUNDS = 6;

/** Ce qu'il faut savoir d'un véhicule pour lui tailler un secteur. */
export interface SectorVehicle {
  readonly id: string;
  /** Combien de tournées il peut encore faire ; 0 : pas de secteur. */
  readonly passages: number;
}

/**
 * **Un secteur par véhicule** (Hugo, 2026-10-07 : « une camionnette peut faire
 * des tours dans un plus faible rayon »). Les arrêts sont groupés par TEMPS de
 * route — aller plus retour, la matrice et non la carte : deux villages
 * proches à vol d'oiseau peuvent être séparés par un col.
 *
 * Chaque secteur a une part des arrêts proportionnelle à ce que son véhicule
 * peut porter (litres de caisse × tournées permises ; sans capacité connue,
 * les tournées seules) : un Kangoo n'hérite pas d'un secteur de Trafic.
 *
 * Médoïdes : le plus loin du dépôt d'abord, puis le plus loin des centres
 * déjà pris. Chaque passage affecte les arrêts au centre le plus proche qui a
 * encore de la place — les plus tranchés d'abord (le plus grand écart entre
 * leur premier et leur second choix) —, puis recentre chaque secteur sur le
 * membre le plus central. Déterministe : ordres fixes, égalités à l'id.
 *
 * Ce n'est qu'un POINT DE DÉPART : la composition peut ensuite sortir un arrêt
 * de son secteur (`proposeRounds`).
 */
export function sectorsOf(
  ctx: PlanningContext,
  stops: readonly RoutingStop[],
  vehicles: readonly SectorVehicle[],
  capacity: CompositionCapacity | undefined,
): ReadonlyMap<string, string> {
  const ids = stops.map((stop) => stop.id).sort(compareIds);
  const weighted = vehicles
    .filter((vehicle) => vehicle.passages > 0)
    .map((vehicle) => ({
      id: vehicle.id,
      weight:
        Math.min(vehicle.passages, ids.length) *
        (capacity?.vehicles.get(vehicle.id)?.cargoLiters ?? 1),
    }))
    .filter((vehicle) => vehicle.weight > 0);
  if (weighted.length < 2 || ids.length === 0) {
    return new Map();
  }
  const gap = (a: string, b: string): number => ctx.cost.seconds(a, b) + ctx.cost.seconds(b, a);
  const quotas = quotasOf(
    weighted.map((vehicle) => vehicle.weight),
    ids.length,
  );
  let centers = seedsOf(ctx.depotId, ids, Math.min(weighted.length, ids.length), gap);
  let assigned = new Map<string, number>();
  for (let round = 0; round < SECTOR_ROUNDS; round += 1) {
    assigned = assign(ids, centers, quotas, gap);
    const next = centers.map(
      (center, index) => medoidOf(membersOf(assigned, index), gap) ?? center,
    );
    if (next.every((center, index) => center === centers[index])) {
      break;
    }
    centers = next;
  }
  return new Map(
    [...assigned].flatMap(([stopId, index]) => {
      const vehicle = weighted[index];
      return vehicle === undefined ? [] : [[stopId, vehicle.id] as const];
    }),
  );
}

/** Une règle de zones qui ne laisse à chaque véhicule que son secteur, EN PLUS des zones réelles. */
export function sectorRuleOf(sectors: ReadonlyMap<string, string>, zones: ZoneRule): ZoneRule {
  const allows = (vehicleId: string, stopId: string): boolean => {
    const owner = sectors.get(stopId);
    return (owner === undefined || owner === vehicleId) && zones.allows(vehicleId, stopId);
  };
  return {
    restricts: true,
    allows,
    admits: (vehicleId, routes, pinned) =>
      routes.every(({ stops }) =>
        stops.every((stop) => pinned.has(stop.id) || allows(vehicleId, stop.id)),
      ),
  };
}

/** Des parts entières proportionnelles aux poids, qui somment au total (plus forts restes). */
function quotasOf(weights: readonly number[], total: number): readonly number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((weight) => (weight / sum) * total);
  const quotas = exact.map(Math.floor);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let left = total - quotas.reduce((a, b) => a + b, 0), at = 0; left > 0; left -= 1, at += 1) {
    const index = order[at % order.length]?.index ?? 0;
    quotas[index] = (quotas[index] ?? 0) + 1;
  }
  return quotas;
}

function seedsOf(
  depotId: string,
  ids: readonly string[],
  count: number,
  gap: (a: string, b: string) => number,
): string[] {
  const seeds: string[] = [];
  const nearestSeed = (id: string): number =>
    seeds.length === 0 ? gap(depotId, id) : Math.min(...seeds.map((seed) => gap(seed, id)));
  while (seeds.length < count) {
    let best: string | null = null;
    let bestGap = -1;
    for (const id of ids) {
      const value = seeds.includes(id) ? -1 : nearestSeed(id);
      if (value > bestGap) {
        best = id;
        bestGap = value;
      }
    }
    if (best === null) break;
    seeds.push(best);
  }
  return seeds;
}

function assign(
  ids: readonly string[],
  centers: readonly string[],
  quotas: readonly number[],
  gap: (a: string, b: string) => number,
): Map<string, number> {
  const ranked = ids.map((id) => {
    const choices = centers
      .map((center, index) => ({ index, gap: gap(center, id) }))
      .sort((a, b) => a.gap - b.gap || a.index - b.index);
    const regret = (choices[1]?.gap ?? 0) - (choices[0]?.gap ?? 0);
    return { id, choices, regret };
  });
  ranked.sort((a, b) => b.regret - a.regret || compareIds(a.id, b.id));
  const left = [...quotas];
  const assigned = new Map<string, number>();
  for (const { id, choices } of ranked) {
    const open = choices.find((choice) => (left[choice.index] ?? 0) > 0) ?? choices[0];
    if (open === undefined) continue;
    assigned.set(id, open.index);
    left[open.index] = (left[open.index] ?? 0) - 1;
  }
  return assigned;
}

function membersOf(assigned: ReadonlyMap<string, number>, index: number): readonly string[] {
  return [...assigned].filter(([, sector]) => sector === index).map(([id]) => id);
}

function medoidOf(
  members: readonly string[],
  gap: (a: string, b: string) => number,
): string | null {
  let best: string | null = null;
  let bestSum = Infinity;
  for (const candidate of members) {
    const sum = members.reduce((total, other) => total + gap(candidate, other), 0);
    if (sum < bestSum) {
      best = candidate;
      bestSum = sum;
    }
  }
  return best;
}
