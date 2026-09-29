import { compareIds } from "./compare-ids.js";
import type { PlanningContext } from "./proposal.js";
import type { RoutingStop } from "./route-timing.js";
import { openingOf, type Routes, scoreVehicle, type VehiclePlan } from "./vehicle-plan.js";

/** Une amélioration plus petite que ça est du bruit de virgule flottante. */
const EPSILON = 1e-6;

/** Où une tournée neuve peut s'ouvrir parmi celles d'un véhicule. */
export type NewRoutePlacement = "anywhere" | "after_existing";

/** Le meilleur endroit trouvé pour un arrêt : quel véhicule, et ses tournées une fois l'arrêt posé. */
interface Placement {
  readonly vehicle: number;
  readonly routes: Routes;
  readonly delta: number;
}

/**
 * **Construire avec les créneaux** (L7b-C1) — insertion au moindre surcoût
 * sur TOUS les véhicules à la fois (famille Solomon I1). Chaque arrêt, dans
 * l'ordre `byPriority`, va à la place — tournée existante ou tournée neuve,
 * sur n'importe quel véhicule — dont le surcoût (route, attente, retards
 * pénalisés, tournée ouverte : `scoreVehicle`) est le plus petit, sans
 * qu'aucune tournée dépasse davantage la durée maximale.
 *
 * Une tournée neuve n'est permise que sous `maxRoutes` ; `after_existing`
 * l'ouvre après les tournées déjà là (mode `insert` : leurs passages sont
 * pris), `anywhere` à n'importe quel rang.
 *
 * Rend les véhicules complétés et ce qui n'a trouvé place nulle part, dans
 * l'ordre de priorité. Déterministe : parcours dans un ordre fixe, et seule
 * une amélioration STRICTE remplace la meilleure place.
 */
export function insertCheapest(
  ctx: PlanningContext,
  plans: readonly VehiclePlan[],
  pending: readonly RoutingStop[],
  newRoutes: NewRoutePlacement,
): { readonly plans: readonly VehiclePlan[]; readonly unplaced: readonly RoutingStop[] } {
  const current = [...plans];
  const unplaced: RoutingStop[] = [];
  for (const stop of byPriority(ctx, pending)) {
    const best = cheapestPlacement(ctx, current, stop, newRoutes);
    const target = best === null ? undefined : current[best.vehicle];
    if (best === null || target === undefined) {
      unplaced.push(stop);
      continue;
    }
    current[best.vehicle] = { ...target, routes: best.routes };
  }
  return { plans: current, unplaced };
}

/**
 * Les créneaux les plus serrés d'abord (L7b-C1) : le plus étroit, puis celui
 * qui ferme le plus tôt ; sans créneau, en dernier. Égalité : l'identifiant.
 */
export function byPriority(
  ctx: PlanningContext,
  stops: readonly RoutingStop[],
): readonly RoutingStop[] {
  const opening = openingOf(ctx);
  const width = (stop: RoutingStop): number =>
    stop.window === null ? Infinity : stop.window.end - (stop.window.start ?? opening);
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
): Placement | null {
  let best: Placement | null = null;
  for (const [vehicle, plan] of plans.entries()) {
    const before = scoreVehicle(ctx, plan.routes);
    for (const routes of placementsOf(plan, stop, newRoutes)) {
      const after = scoreVehicle(ctx, routes);
      const delta = after.cost - before.cost;
      if (
        after.overSeconds <= before.overSeconds &&
        (best === null || delta < best.delta - EPSILON)
      ) {
        best = { vehicle, routes, delta };
      }
    }
  }
  return best;
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
