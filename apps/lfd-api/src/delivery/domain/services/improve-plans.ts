import type { PlanningContext } from "./proposal.js";
import { type MoveScope, nearnessOf } from "./move-scope.js";
import { intraRouteMoves, type Move, relocations, swaps, tailExchanges } from "./route-moves.js";
import {
  freeStart,
  isBetterScore,
  type Routes,
  scoreVehicle,
  type VehiclePlan,
  type VehicleScore,
  type VehicleStart,
} from "./vehicle-plan.js";

/**
 * Garde-fou de durée (L7b-C2) : chaque geste retenu baisse STRICTEMENT le
 * coût, donc la recherche s'arrête d'elle-même ; la borne tient le pire cas
 * à un nombre fixe de gestes — sans horloge, pour rester déterministe.
 */
const MAX_MOVES = 400;

type ScoreFn = (routes: Routes, start: VehicleStart) => VehicleScore;

/**
 * Le score d'un véhicule ne dépend que de son départ et de la suite de ses
 * arrêts (`ctx` est fixe pendant tout le calcul). Les mêmes configurations
 * reviennent d'un tour à l'autre — chaque tour rouvre les paires dont un
 * véhicule a changé, et réessaie les mêmes gestes sur l'autre — : les noter
 * une fois. Mesuré le 2026-10-04 : depuis le départ à rebours (CA2),
 * `scoreVehicle` faisait 90 % du temps du calcul, et la CI passait la borne
 * de L7b-C2.
 */
function memoizedScore(ctx: PlanningContext): ScoreFn {
  const known = new Map<string, VehicleScore>();
  return (routes, start) => {
    const key = `${start.availableFrom}/${start.passagesBefore}/${routes
      .map(({ stops }) => stops.map((stop) => stop.id).join(","))
      .join("|")}`;
    const cached = known.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const scored = scoreVehicle(ctx, routes, start);
    known.set(key, scored);
    return scored;
  };
}

/** Les voisinages, du moins cher au plus large. */
const NEIGHBOURHOODS = [intraRouteMoves, relocations, swaps, tailExchanges] as const;

/**
 * **Améliorer** (L7b-C2) : tant qu'un geste baisse le coût, on le prend —
 * dans une tournée (Or-opt, 2-opt), puis entre tournées et entre véhicules
 * (déplacer un arrêt, permuter deux arrêts, 2-opt*). « Baisser » se lit
 * dans l'ordre de L7t-C1 : moins de retard d'abord, puis moins cher. La
 * durée maximale ne refuse aucun geste (CA2, Q2) : elle n'est qu'un signal.
 *
 * Les gestes se cherchent par PAIRE de véhicules — un véhicule seul (ses
 * tournées entre elles), puis deux véhicules (les gestes de l'un à l'autre) :
 * un geste ne touche jamais qu'eux. Une
 * paire où rien n'améliore est notée propre, et n'est rouverte que si l'un
 * des deux a changé — c'est ce qui tient soixante arrêts sous deux secondes.
 *
 * Premier geste améliorant, paires et voisinages parcourus dans un ordre
 * fixe : aucun aléa, même entrée, même résultat.
 */
export function improvePlans(
  ctx: PlanningContext,
  plans: readonly VehiclePlan[],
  pinned: ReadonlySet<string>,
): readonly VehiclePlan[] {
  const current = [...plans];
  const score = memoizedScore(ctx);
  const scores = current.map((plan) => score(plan.routes, plan));
  const clean = new WeakMap<Routes, WeakSet<Routes>>();
  const near = nearnessOf(ctx, current);
  let moves = 0;
  let improved = true;
  while (improved && moves < MAX_MOVES) {
    improved = false;
    for (const [a, b] of pairsOf(current.length)) {
      const routesA = current[a]?.routes ?? [];
      const routesB = current[b]?.routes ?? [];
      if (clean.get(routesA)?.has(routesB) === true || moves >= MAX_MOVES) {
        continue;
      }
      const members = a === b ? [a] : [a, b];
      const scope = { pinned, crossOnly: a !== b, near };
      const found = firstImprovement(score, freeStart(ctx), members, current, scores, scope);
      if (found === null) {
        const set = clean.get(routesA) ?? new WeakSet<Routes>();
        set.add(routesB);
        clean.set(routesA, set);
        continue;
      }
      apply(current, scores, members, found);
      moves += 1;
      improved = true;
    }
  }
  return current;
}

/** `(0,0), (0,1), …, (1,1), (1,2), …` : chaque véhicule avec lui-même, puis avec les suivants. */
function* pairsOf(count: number): Generator<readonly [number, number]> {
  for (let a = 0; a < count; a += 1) {
    for (let b = a; b < count; b += 1) {
      yield [a, b];
    }
  }
}

interface Found {
  readonly move: Move;
  readonly scores: readonly VehicleScore[];
}

/** Le premier geste qui améliore, parmi les véhicules `members` seulement. */
function firstImprovement(
  score: ScoreFn,
  free: VehicleStart,
  members: readonly number[],
  plans: readonly VehiclePlan[],
  scores: readonly VehicleScore[],
  scope: MoveScope,
): Found | null {
  const sub = members.flatMap((index) => plans[index] ?? []);
  const subScores = members.flatMap((index) => scores[index] ?? []);
  for (const neighbourhood of NEIGHBOURHOODS) {
    for (const move of neighbourhood(sub, scope)) {
      const after = move.map(({ vehicle, routes }) => score(routes, sub[vehicle] ?? free));
      const before = move.map(({ vehicle }) => subScores[vehicle]);
      if (improves(before, after)) {
        return { move, scores: after };
      }
    }
  }
  return null;
}

/** Applique un geste trouvé sur une sous-liste : ses indices sont ceux de `members`. */
function apply(
  plans: VehiclePlan[],
  scores: VehicleScore[],
  members: readonly number[],
  found: Found,
): void {
  found.move.forEach(({ vehicle, routes }, index) => {
    const target = members[vehicle];
    const score = found.scores[index];
    const plan = target === undefined ? undefined : plans[target];
    if (target !== undefined && plan !== undefined && score !== undefined) {
      plans[target] = { ...plan, routes };
      scores[target] = score;
    }
  });
}

function improves(
  before: readonly (VehicleScore | undefined)[],
  after: readonly VehicleScore[],
): boolean {
  const sum = (list: readonly (VehicleScore | undefined)[], key: keyof VehicleScore): number =>
    list.reduce((total, score) => total + (score?.[key] ?? 0), 0);
  const total = (list: readonly (VehicleScore | undefined)[]) => ({
    lateSeconds: sum(list, "lateSeconds"),
    cost: sum(list, "cost"),
  });
  return isBetterScore(total(after), total(before));
}
