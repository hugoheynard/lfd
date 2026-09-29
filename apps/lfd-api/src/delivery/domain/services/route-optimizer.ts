import type { CostFn } from "../ports/distance-matrix.js";
import { type RouteClock, type RoutingStop, routeScore, timeRoute } from "./route-timing.js";

/** Une amélioration plus petite que ça est du bruit de virgule flottante. */
const EPSILON = 1e-6;
/** Or-opt déplace des segments de 1 à 3 arrêts (architecture des tournées, §7). */
const OR_OPT_MAX_SEGMENT = 3;
/** Garde-fou : la recherche locale converge bien avant, à l'échelle réelle. */
const MAX_PASSES = 100;

/**
 * **Ordonne UNE tournée** (L7-C3) — ATSP : plus proche voisin, puis Or-opt et
 * 2-opt, départ et retour au point de départ.
 *
 * Asymétrique dès le départ : chaque candidat est rechronométré en entier
 * (`timeRoute`, O(n)), si bien qu'un segment inversé coûte ce qu'il coûte
 * VRAIMENT dans le nouveau sens. Abordable à n ≲ 40 arrêts par tournée.
 *
 * **Déterministe** (L7-C12) : l'entrée est triée par identifiant, le plus
 * proche voisin départage les égalités par identifiant, les voisinages sont
 * parcourus dans un ordre fixe, et seule une amélioration STRICTE est retenue.
 * Aucun aléa.
 */
export function optimizeRoute(
  depotId: string,
  stops: readonly RoutingStop[],
  cost: CostFn,
  clock: RouteClock,
): readonly RoutingStop[] {
  let best = nearestNeighbour(depotId, sortedById(stops), cost);
  let bestScore = routeScore(timeRoute(depotId, best, cost, clock));
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const candidate = firstImprovement(
      best,
      (sequence) => routeScore(timeRoute(depotId, sequence, cost, clock)) < bestScore - EPSILON,
    );
    if (candidate === null) {
      break;
    }
    best = candidate;
    bestScore = routeScore(timeRoute(depotId, best, cost, clock));
  }
  return best;
}

/** Le plus proche voisin en temps de trajet, depuis le point de départ. */
export function nearestNeighbour(
  depotId: string,
  stops: readonly RoutingStop[],
  cost: CostFn,
): readonly RoutingStop[] {
  const left = [...sortedById(stops)];
  const sequence: RoutingStop[] = [];
  let from = depotId;
  while (left.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < left.length; index += 1) {
      const candidate = left[index];
      const current = left[bestIndex];
      if (
        candidate !== undefined &&
        current !== undefined &&
        cost.seconds(from, candidate.id) < cost.seconds(from, current.id)
      ) {
        bestIndex = index;
      }
    }
    const [next] = left.splice(bestIndex, 1);
    if (next === undefined) {
      break;
    }
    sequence.push(next);
    from = next.id;
  }
  return sequence;
}

/** Le premier voisin Or-opt, puis 2-opt, qui améliore ; `null` si aucun. */
function firstImprovement(
  sequence: readonly RoutingStop[],
  improves: (candidate: readonly RoutingStop[]) => boolean,
): readonly RoutingStop[] | null {
  for (const candidate of orOptNeighbours(sequence)) {
    if (improves(candidate)) {
      return candidate;
    }
  }
  for (const candidate of twoOptNeighbours(sequence)) {
    if (improves(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Déplace un segment de 1 à 3 arrêts à une autre place. */
function* orOptNeighbours(sequence: readonly RoutingStop[]): Generator<readonly RoutingStop[]> {
  for (let length = 1; length <= OR_OPT_MAX_SEGMENT; length += 1) {
    for (let from = 0; from + length <= sequence.length; from += 1) {
      const segment = sequence.slice(from, from + length);
      const rest = [...sequence.slice(0, from), ...sequence.slice(from + length)];
      for (let to = 0; to <= rest.length; to += 1) {
        if (to !== from) {
          yield [...rest.slice(0, to), ...segment, ...rest.slice(to)];
        }
      }
    }
  }
}

/** Inverse un segment `[i, j]`. */
function* twoOptNeighbours(sequence: readonly RoutingStop[]): Generator<readonly RoutingStop[]> {
  for (let i = 0; i < sequence.length - 1; i += 1) {
    for (let j = i + 1; j < sequence.length; j += 1) {
      yield [
        ...sequence.slice(0, i),
        ...sequence.slice(i, j + 1).reverse(),
        ...sequence.slice(j + 1),
      ];
    }
  }
}

function sortedById(stops: readonly RoutingStop[]): readonly RoutingStop[] {
  return [...stops].sort((a, b) => compareIds(a.id, b.id));
}

/** L'ordre des identifiants, indépendant de la locale. */
export function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
