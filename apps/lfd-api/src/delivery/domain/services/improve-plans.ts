import { type CapacityGuard, NO_CAPACITY_LIMIT } from "./capacity-guard.js";
import { bestCase, type CostFloor, costFloorOf } from "./cost-floor.js";
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
import { NO_ZONE_RULE, type ZoneRule } from "./zone-rule.js";

/**
 * Garde-fou de durée (L7b-C2) : chaque geste retenu baisse STRICTEMENT le
 * coût, donc la recherche s'arrête d'elle-même ; la borne tient le pire cas
 * à un nombre fixe de gestes — sans horloge, pour rester déterministe.
 */
const MAX_MOVES = 400;

/**
 * Le score d'un véhicule ne dépend que de son départ et de la suite de ses
 * arrêts (`ctx` est fixe pendant tout le calcul).
 *
 * Il n'est plus mis en mémoire (composition-automatique.md §5, 2026-10-06) :
 * la clé — les identifiants de tous les arrêts du véhicule, mis bout à bout —
 * coûtait plus cher à fabriquer que le score qu'elle épargnait. Mesuré sur la
 * graine 9 du banc à 200 clients : 43 % de réussites, et 6,6 s → 5,7 s sans
 * la mémoire. Le minorant (`costFloorOf`) écarte d'abord ce qui ne peut pas
 * améliorer, sans chronométrer.
 */
type ScoreFn = (routes: Routes, start: VehicleStart) => VehicleScore;

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
 * Un geste qui ferait déborder une caisse (`guard`, CA4) n'est pas pris :
 * la capacité est une contrainte dure, jugée après le score — seul un geste
 * qui améliore est soumis au plan de chargement.
 *
 * Un geste qui ferait entrer un arrêt dans un véhicule non autorisé sur sa
 * zone (`zones`, 2026-10-06) n'est pas même noté : la règle est jugée avant
 * le minorant, et seulement entre deux véhicules — un geste dans un véhicule
 * seul ne lui apporte aucun arrêt neuf. Sans véhicule restreint, elle ne
 * coûte rien.
 *
 * Premier geste améliorant, paires et voisinages parcourus dans un ordre
 * fixe : aucun aléa, même entrée, même résultat.
 */
export function improvePlans(
  ctx: PlanningContext,
  plans: readonly VehiclePlan[],
  pinned: ReadonlySet<string>,
  guard: CapacityGuard = NO_CAPACITY_LIMIT,
  zones: ZoneRule = NO_ZONE_RULE,
): readonly VehiclePlan[] {
  const current = [...plans];
  const score: ScoreFn = (routes, start) => scoreVehicle(ctx, routes, start);
  const floor = costFloorOf(ctx);
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
      const found = firstImprovement(
        { score, floor, guard, zones, free: freeStart(ctx) },
        members,
        current,
        scores,
        scope,
      );
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

/** Ce que la recherche d'un geste lit, fixe pendant tout le calcul. */
interface Search {
  readonly score: ScoreFn;
  readonly floor: CostFloor;
  readonly guard: CapacityGuard;
  readonly zones: ZoneRule;
  readonly free: VehicleStart;
}

/** Le premier geste qui améliore ET tient dans les caisses, parmi les véhicules `members`. */
function firstImprovement(
  { score, floor, guard, zones, free }: Search,
  members: readonly number[],
  plans: readonly VehiclePlan[],
  scores: readonly VehicleScore[],
  scope: MoveScope,
): Found | null {
  const sub = members.flatMap((index) => plans[index] ?? []);
  const subScores = members.flatMap((index) => scores[index] ?? []);
  const zoned = scope.crossOnly && zones.restricts;
  for (const neighbourhood of NEIGHBOURHOODS) {
    for (const move of neighbourhood(sub, scope)) {
      if (
        zoned &&
        !move.every(({ vehicle, routes }) => zoneAdmits(zones, sub[vehicle], routes, scope))
      ) {
        continue;
      }
      const before = totalOf(move.map(({ vehicle }) => subScores[vehicle]));
      // Écarté sans chronométrer : même son meilleur cas n'améliore pas (`bestCase`).
      const lowest = move.reduce(
        (total, { vehicle, routes }) => total + floor(routes, sub[vehicle] ?? free),
        0,
      );
      if (!isBetterScore(bestCase(lowest), before)) {
        continue;
      }
      const after = move.map(({ vehicle, routes }) => score(routes, sub[vehicle] ?? free));
      if (
        isBetterScore(totalOf(after), before) &&
        move.every(({ vehicle, routes }) => {
          const plan = sub[vehicle];
          return plan === undefined || guard.fits(plan.vehicle.id, routes);
        })
      ) {
        return { move, scores: after };
      }
    }
  }
  return null;
}

/** Le véhicule peut-il recevoir ces tournées ? Un arrêt épinglé ne quitte pas le sien. */
function zoneAdmits(
  zones: ZoneRule,
  plan: VehiclePlan | undefined,
  routes: Routes,
  scope: MoveScope,
): boolean {
  return plan === undefined || zones.admits(plan.vehicle.id, routes, scope.pinned);
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

/** La somme des scores d'un geste, dans l'ordre de ses véhicules. */
function totalOf(list: readonly (VehicleScore | undefined)[]): VehicleScore {
  const sum = (key: keyof VehicleScore): number =>
    list.reduce((total, score) => total + (score?.[key] ?? 0), 0);
  return { lateSeconds: sum("lateSeconds"), cost: sum("cost") };
}
