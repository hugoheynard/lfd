import { type CapacityGuard, NO_CAPACITY_LIMIT } from "./capacity-guard.js";
import { compareIds } from "./compare-ids.js";
import type { PlanningContext } from "./proposal.js";
import { DAY_START, type RoutingStop } from "./route-timing.js";
import { isBetterScore, type Routes, scoreVehicle, type VehiclePlan } from "./vehicle-plan.js";
import { NO_ZONE_RULE, type ZoneRule } from "./zone-rule.js";

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
 * (`no_passage`), des places existaient mais aucune ne tenait dans la
 * caisse (`capacity`, CA4), ou aucun véhicule n'est autorisé sur sa zone
 * (`zone`, 2026-10-06).
 */
export type UnplacedReason = "no_passage" | "capacity" | "zone";

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
 * 🔴 **Les zones aussi** (2026-10-06) : un véhicule qui n'est pas autorisé
 * sur la zone de l'arrêt (`zones`) n'est pas même essayé — avant le score,
 * puisque la règle ne coûte qu'une lecture. Si AUCUN véhicule ne l'est,
 * l'arrêt reste à répartir avec la raison `zone` ; sinon, la raison est celle
 * des véhicules autorisés.
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
  zones: ZoneRule = NO_ZONE_RULE,
): { readonly plans: readonly VehiclePlan[]; readonly unplaced: readonly UnplacedStop[] } {
  const current = [...plans];
  const unplaced: UnplacedStop[] = [];
  for (const stop of byPriority(pending)) {
    const { best, refused, zoneBlocked } = cheapestPlacement(
      { ctx, newRoutes, guard, zones },
      current,
      stop,
    );
    const target = best === null ? undefined : current[best.vehicle];
    if (best === null || target === undefined) {
      const reason = zoneBlocked ? "zone" : refused ? "capacity" : "no_passage";
      unplaced.push({ stop, reason });
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

/** Ce que la recherche d'une place lit, fixe pendant toute l'insertion. */
interface PlacementSearch {
  readonly ctx: PlanningContext;
  readonly newRoutes: NewRoutePlacement;
  readonly guard: CapacityGuard;
  readonly zones: ZoneRule;
}

/** `zoneBlocked` : au moins un véhicule écarté pour la zone, et aucun autorisé. */
function cheapestPlacement(
  { ctx, newRoutes, guard, zones }: PlacementSearch,
  plans: readonly VehiclePlan[],
  stop: RoutingStop,
): { readonly best: Placement | null; readonly refused: boolean; readonly zoneBlocked: boolean } {
  let best: Placement | null = null;
  let refused = false;
  let allowed = false;
  let blocked = false;
  for (const [vehicle, plan] of plans.entries()) {
    if (!zones.allows(plan.vehicle.id, stop.id)) {
      blocked = true;
      continue;
    }
    allowed = true;
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
  return { best, refused, zoneBlocked: blocked && !allowed };
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
