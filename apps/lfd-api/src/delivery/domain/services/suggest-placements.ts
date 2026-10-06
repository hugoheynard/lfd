import { capacityGuardOf, type CompositionCapacity, NO_CAPACITY_LIMIT } from "./capacity-guard.js";
import { compareIds } from "./compare-ids.js";
import { cheapestPlacement, type Placement, type PlacementSearch } from "./insert-cheapest.js";
import type { InsertableRound } from "./insert-into-rounds.js";
import type { PlanningContext, PlanningVehicle } from "./proposal.js";
import { startOf } from "./propose-rounds.js";
import { durationOf, type RoutingStop } from "./route-timing.js";
import { timeVehicle, type VehiclePlan, type VehicleStart } from "./vehicle-plan.js";
import { type CompositionZones, zoneRuleOf } from "./zone-rule.js";

/** Un retard plus petit que ça est du bruit de virgule flottante (comme `isBetterScore`). */
const EPSILON = 1e-6;

/**
 * Pourquoi aucune place n'est suggérée : aucune tournée n'a la place
 * (`capacity`), aucun véhicule n'est autorisé sur sa zone (`zone`), la
 * meilleure place ferait manquer une échéance (`deadline`), ou il n'y a
 * aucune tournée où l'insérer (`no_round`).
 */
export type NoSuggestionReason = "capacity" | "zone" | "deadline" | "no_round";

/** La place suggérée d'une commande : dans quelle tournée, après combien d'arrêts, pour combien. */
export interface SuggestedPlacement {
  readonly kind: "placed";
  readonly orderId: string;
  readonly roundId: string;
  /** Combien d'arrêts de la tournée passent avant elle : 0 = en tête. */
  readonly position: number;
  /** Ce que la tournée dure de plus, en secondes. */
  readonly extraSeconds: number;
}

export interface NoSuggestion {
  readonly kind: "none";
  readonly orderId: string;
  readonly reason: NoSuggestionReason;
}

export type PlacementSuggestion = SuggestedPlacement | NoSuggestion;

export interface SuggestionInput extends PlanningContext {
  /** Les commandes à répartir, situées. */
  readonly stops: readonly RoutingStop[];
  readonly vehicles: readonly PlanningVehicle[];
  /** Les tournées où une place peut être suggérée : au dépôt, rien de chargé. */
  readonly rounds: readonly InsertableRound[];
  /** D'où part chaque véhicule occupé par une tournée chargée ou partie ; absent : minuit. */
  readonly starts?: ReadonlyMap<string, VehicleStart>;
  readonly capacity?: CompositionCapacity;
  readonly zones?: CompositionZones;
}

/**
 * **La place suggérée** (CA7, `composition-automatique.md` §5) : pour CHAQUE
 * commande à répartir, prise SEULE, l'insertion la moins chère dans les
 * tournées existantes — la même recherche que « Insérer »
 * (`cheapestPlacement`), avec la même capacité et les mêmes zones.
 *
 * 🔴 **Rien n'est réordonné, rien n'est ouvert** : aucune tournée neuve
 * (`maxRoutes` = les tournées du véhicule), aucun geste d'amélioration. La
 * suggestion est un seul geste, « attacher cet arrêt à ce rang », que le
 * bureau fait en un clic. Chaque commande est jugée contre la composition
 * ENREGISTRÉE, indépendamment des autres : deux suggestions peuvent viser la
 * même place, et la première posée rend l'autre périmée (409, relue).
 *
 * L'échéance est une contrainte de la suggestion (règle n°1) : une place qui
 * ajoute du retard, à elle ou à un autre arrêt, n'est pas suggérée — raison
 * `deadline`. Comme `isBetterScore` classe le retard d'abord, si la meilleure
 * place en ajoute, aucune ne le tient.
 *
 * Pure et déterministe : rendu dans l'ordre des identifiants.
 */
export function suggestPlacements(input: SuggestionInput): readonly PlacementSuggestion[] {
  const plans = initialPlans(input);
  const search: PlacementSearch = {
    ctx: input,
    newRoutes: "after_existing",
    guard: input.capacity === undefined ? NO_CAPACITY_LIMIT : capacityGuardOf(input.capacity),
    zones: zoneRuleOf(input.zones),
  };
  return [...input.stops]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((stop) => suggestionFor(input, search, plans, stop));
}

/**
 * Chaque véhicule qui porte une tournée, avec ses tournées, sans droit à une
 * de plus. Un véhicule sans tournée n'offre aucune place : il ne compte ni
 * pour la zone ni pour la capacité.
 */
function initialPlans(input: SuggestionInput): readonly VehiclePlan[] {
  return [...input.vehicles]
    .sort((a, b) => compareIds(a.id, b.id))
    .filter((vehicle) => input.rounds.some((round) => round.vehicleId === vehicle.id))
    .map((vehicle) => {
      const own = input.rounds
        .filter((round) => round.vehicleId === vehicle.id)
        .sort((a, b) => a.passage - b.passage);
      return {
        vehicle,
        maxRoutes: own.length,
        ...startOf(input, vehicle.id),
        routes: own.map((round) => ({ roundId: round.roundId, stops: round.stops })),
      };
    });
}

function suggestionFor(
  ctx: PlanningContext,
  search: PlacementSearch,
  plans: readonly VehiclePlan[],
  stop: RoutingStop,
): PlacementSuggestion {
  const none = (reason: NoSuggestionReason): NoSuggestion => ({
    kind: "none",
    orderId: stop.id,
    reason,
  });
  const { best, refused, zoneBlocked } = cheapestPlacement(search, plans, stop);
  if (best === null) {
    return none(zoneBlocked ? "zone" : refused ? "capacity" : "no_round");
  }
  const plan = plans[best.vehicle];
  const placed = plan === undefined ? null : placedOf(ctx, plan, best, stop.id);
  if (placed === null) {
    return none("no_round");
  }
  return best.delta.lateSeconds > EPSILON || placed.missed ? none("deadline") : placed.suggestion;
}

/** Où l'arrêt a été posé dans `best`, ce que sa tournée dure de plus, et s'il y est en retard. */
function placedOf(
  ctx: PlanningContext,
  plan: VehiclePlan,
  best: Placement,
  orderId: string,
): { readonly suggestion: SuggestedPlacement; readonly missed: boolean } | null {
  const index = best.routes.findIndex((route) => route.stops.some((stop) => stop.id === orderId));
  const route = best.routes[index];
  if (route === undefined || route.roundId === null) {
    return null;
  }
  const before = timeVehicle(ctx, plan.routes, plan.availableFrom)[index];
  const after = timeVehicle(ctx, best.routes, plan.availableFrom)[index];
  if (before === undefined || after === undefined) {
    return null;
  }
  const position = route.stops.findIndex((stop) => stop.id === orderId);
  return {
    suggestion: {
      kind: "placed",
      orderId,
      roundId: route.roundId,
      position,
      extraSeconds: Math.max(0, durationOf(after) - durationOf(before)),
    },
    missed: after.missed[position] ?? false,
  };
}
