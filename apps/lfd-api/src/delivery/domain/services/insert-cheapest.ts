import { type CapacityGuard, NO_CAPACITY_LIMIT } from "./capacity-guard.js";
import { compareIds } from "./compare-ids.js";
import type { PlanningContext } from "./proposal.js";
import { DAY_START, type RoutingStop } from "./route-timing.js";
import { isBetterScore, type Routes, scoreVehicle, type VehiclePlan } from "./vehicle-plan.js";

/** Où une tournée neuve peut s'ouvrir parmi celles d'un véhicule. */
export type NewRoutePlacement = "anywhere" | "after_existing";

/** Le meilleur endroit trouvé pour un arrêt : quel véhicule, et ses tournées une fois l'arrêt posé. */
interface Placement {
  readonly vehicle: number;
  readonly routes: Routes;
  /** Le surcoût : retard ajouté d'abord, puis le reste (L7t-C1). */
  readonly delta: { readonly lateSeconds: number; readonly cost: number };
}

/**
 * Pourquoi un arrêt n'a trouvé place nulle part : plus aucun passage permis
 * (`no_passage`), ou des places existaient mais aucune ne tenait dans la
 * caisse (`capacity`, CA4).
 */
export type UnplacedReason = "no_passage" | "capacity";

export interface UnplacedStop {
  readonly stop: RoutingStop;
  readonly reason: UnplacedReason;
}

/**
 * **Construire avec les créneaux** (L7b-C1) — insertion au moindre surcoût
 * sur TOUS les véhicules à la fois (famille Solomon I1). Chaque arrêt, dans
 * l'ordre `byPriority`, va à la place — tournée existante ou tournée neuve,
 * sur n'importe quel véhicule — dont le surcoût est le plus petit : le moins
 * de retard ajouté d'abord, puis marge, route, attente, tournée ouverte
 * (`scoreVehicle`, L7t-C1). La durée maximale d'une tournée ne refuse
 * aucune place (CA2, Q2) : elle cède devant la règle 1.
 *
 * Une tournée neuve n'est permise que sous `maxRoutes` ; `after_existing`
 * l'ouvre après les tournées déjà là (mode `insert` : leurs passages sont
 * pris), `anywhere` à n'importe quel rang.
 *
 * 🔴 **La capacité est une contrainte DURE** (CA4, CA-D1) : une place qui
 * ferait déborder le véhicule (`guard`) n'est pas une place, quel que soit
 * son coût — la recherche prend la meilleure de celles qui tiennent. Elle
 * ne devient jamais une pénalité : l'ordre des échéances reste celui de
 * `isBetterScore`. Seule une place qui battrait la meilleure est soumise au
 * plan de chargement.
 *
 * Rend les véhicules complétés et ce qui n'a trouvé place nulle part, dans
 * l'ordre de priorité, avec sa raison. Déterministe : parcours dans un ordre fixe, et seule
 * une amélioration STRICTE remplace la meilleure place.
 */
export function insertCheapest(
  ctx: PlanningContext,
  plans: readonly VehiclePlan[],
  pending: readonly RoutingStop[],
  newRoutes: NewRoutePlacement,
  guard: CapacityGuard = NO_CAPACITY_LIMIT,
): { readonly plans: readonly VehiclePlan[]; readonly unplaced: readonly UnplacedStop[] } {
  const current = [...plans];
  const unplaced: UnplacedStop[] = [];
  for (const stop of byPriority(pending)) {
    const { best, refused } = cheapestPlacement(ctx, current, stop, newRoutes, guard);
    const target = best === null ? undefined : current[best.vehicle];
    if (best === null || target === undefined) {
      unplaced.push({ stop, reason: refused ? "capacity" : "no_passage" });
      continue;
    }
    current[best.vehicle] = { ...target, routes: best.routes };
  }
  return { plans: current, unplaced };
}

/**
 * Les créneaux les plus serrés d'abord (L7b-C1) : le plus étroit, puis celui
 * qui ferme le plus tôt ; sans créneau, en dernier. Égalité : l'identifiant.
 * Une échéance (fenêtre sans début) court depuis minuit du jour (CA2, Q1).
 */
export function byPriority(stops: readonly RoutingStop[]): readonly RoutingStop[] {
  const width = (stop: RoutingStop): number =>
    stop.window === null ? Infinity : stop.window.end - (stop.window.start ?? DAY_START);
  const end = (stop: RoutingStop): number => stop.window?.end ?? Infinity;
  return [...stops].sort(
    (a, b) => width(a) - width(b) || end(a) - end(b) || compareIds(a.id, b.id),
  );
}

function cheapestPlacement(
  ctx: PlanningContext,
  plans: readonly VehiclePlan[],
  stop: RoutingStop,
  newRoutes: NewRoutePlacement,
  guard: CapacityGuard,
): { readonly best: Placement | null; readonly refused: boolean } {
  let best: Placement | null = null;
  let refused = false;
  for (const [vehicle, plan] of plans.entries()) {
    const before = scoreVehicle(ctx, plan.routes, plan);
    for (const routes of placementsOf(plan, stop, newRoutes)) {
      const after = scoreVehicle(ctx, routes, plan);
      const delta = {
        lateSeconds: after.lateSeconds - before.lateSeconds,
        cost: after.cost - before.cost,
      };
      if (best !== null && !isBetterScore(delta, best.delta)) {
        continue;
      }
      if (guard.fits(plan.vehicle.id, routes)) {
        best = { vehicle, routes, delta };
      } else {
        refused = true;
      }
    }
  }
  return { best, refused };
}

/** Toutes les façons de poser l'arrêt chez ce véhicule : dans une tournée, ou dans une neuve. */
function* placementsOf(
  plan: VehiclePlan,
  stop: RoutingStop,
  newRoutes: NewRoutePlacement,
): Generator<Routes> {
  const { routes } = plan;
  for (const [route, { stops }] of routes.entries()) {
    for (let position = 0; position <= stops.length; position += 1) {
      yield routes.map((current, index) =>
        index === route
          ? { ...current, stops: [...stops.slice(0, position), stop, ...stops.slice(position)] }
          : current,
      );
    }
  }
  if (routes.length >= plan.maxRoutes) {
    return;
  }
  const firstRank = newRoutes === "anywhere" ? 0 : routes.length;
  for (let rank = firstRank; rank <= routes.length; rank += 1) {
    yield [...routes.slice(0, rank), { roundId: null, stops: [stop] }, ...routes.slice(rank)];
  }
}
