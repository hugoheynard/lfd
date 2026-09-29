import type { CostFn } from "../ports/distance-matrix.js";
import { compareIds } from "./route-optimizer.js";

/** Garde-fou : k-medoids converge en quelques tours à l'échelle réelle. */
const MAX_ITERATIONS = 100;

/**
 * **Répartit des arrêts entre au plus `k` groupes** (L7-C3) — k-medoids sur
 * les COÛTS, jamais sur l'angle autour du départ : une vallée fait diverger
 * proximité angulaire et proximité routière. La distance entre deux arrêts
 * est l'aller PLUS le retour, pour qu'une matrice asymétrique reste une
 * distance.
 *
 * **Déterministe** (L7-C12) : identifiants triés ; médoïdes initiaux au plus
 * éloigné d'abord — depuis le départ, puis le plus loin des médoïdes déjà
 * choisis ; toute égalité est départagée par l'identifiant ; aucun aléa.
 *
 * Rend les groupes triés par l'identifiant de leur médoïde, membres triés.
 * Moins d'arrêts que de groupes : un groupe par arrêt.
 */
export function partitionStops(
  depotId: string,
  stopIds: readonly string[],
  k: number,
  cost: CostFn,
): readonly (readonly string[])[] {
  const ids = [...new Set(stopIds)].sort(compareIds);
  if (ids.length === 0 || k < 1) {
    return [];
  }
  const distance = (a: string, b: string): number => cost.seconds(a, b) + cost.seconds(b, a);
  let medoids = initialMedoids(depotId, ids, Math.min(k, ids.length), distance);
  let clusters = assign(ids, medoids, distance);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    // Deux arrêts au même point : l'un des deux groupes reste vide, et disparaît.
    const next = clusters
      .filter((members) => members.length > 0)
      .map((members) => medoidOf(members, distance))
      .sort(compareIds);
    if (next.length === medoids.length && next.every((id, index) => id === medoids[index])) {
      break;
    }
    medoids = next;
    clusters = assign(ids, medoids, distance);
  }
  return clusters.filter((members) => members.length > 0);
}

type Distance = (a: string, b: string) => number;

/** Le plus éloigné du départ, puis, tour à tour, le plus loin des médoïdes choisis. */
function initialMedoids(
  depotId: string,
  ids: readonly string[],
  k: number,
  distance: Distance,
): readonly string[] {
  const chosen: string[] = [];
  const farthest = (score: (id: string) => number): string | undefined => {
    let best: string | undefined;
    let bestScore = -Infinity;
    for (const id of ids) {
      const value = chosen.includes(id) ? -Infinity : score(id);
      if (value > bestScore) {
        best = id;
        bestScore = value;
      }
    }
    return best;
  };
  const first = farthest((id) => distance(depotId, id));
  if (first !== undefined) {
    chosen.push(first);
  }
  while (chosen.length < k) {
    const next = farthest((id) => Math.min(...chosen.map((medoid) => distance(id, medoid))));
    if (next === undefined) {
      break;
    }
    chosen.push(next);
  }
  return chosen.sort(compareIds);
}

/** Chaque arrêt au médoïde le plus proche ; à égalité, le premier par identifiant. */
function assign(
  ids: readonly string[],
  medoids: readonly string[],
  distance: Distance,
): readonly (readonly string[])[] {
  const clusters: string[][] = medoids.map(() => []);
  for (const id of ids) {
    let bestIndex = 0;
    for (let index = 1; index < medoids.length; index += 1) {
      const candidate = medoids[index];
      const current = medoids[bestIndex];
      if (
        candidate !== undefined &&
        current !== undefined &&
        distance(id, candidate) < distance(id, current)
      ) {
        bestIndex = index;
      }
    }
    clusters[bestIndex]?.push(id);
  }
  return clusters;
}

/** Le membre qui minimise la somme des distances aux autres ; à égalité, le premier. */
function medoidOf(members: readonly string[], distance: Distance): string {
  let best = members[0] ?? "";
  let bestSum = Infinity;
  for (const candidate of members) {
    const sum = members.reduce((total, other) => total + distance(candidate, other), 0);
    if (sum < bestSum) {
      best = candidate;
      bestSum = sum;
    }
  }
  return best;
}
