import { capacityGuardOf, type CompositionCapacity, NO_CAPACITY_LIMIT } from "./capacity-guard.js";
import { compareIds } from "./compare-ids.js";
import { improvePlans } from "./improve-plans.js";
import { insertCheapest } from "./insert-cheapest.js";
import type { PlanningContext, PlanningVehicle, Proposal, ProposedTour } from "./proposal.js";
import { startOf, tourOf } from "./propose-rounds.js";
import type { RoutingStop } from "./route-timing.js";
import { timeVehicle, type VehiclePlan, type VehicleStart } from "./vehicle-plan.js";
import { type CompositionZones, zoneRuleOf } from "./zone-rule.js";
import type { UnplacedReason } from "./insert-cheapest.js";

/** Une tournée existante, au dépôt, dont chaque arrêt est situé : on peut y insérer. */
export interface InsertableRound {
  readonly roundId: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** Ses arrêts, dans l'ordre choisi À LA MAIN : il ne sera pas changé. */
  readonly stops: readonly RoutingStop[];
}

export interface InsertionInput extends PlanningContext {
  /** Les commandes à répartir, situées. */
  readonly stops: readonly RoutingStop[];
  readonly vehicles: readonly PlanningVehicle[];
  readonly rounds: readonly InsertableRound[];
  /** Combien de tournées NEUVES chaque véhicule peut recevoir ; absent : autant qu'il en faut. */
  readonly passageLimits?: ReadonlyMap<string, number>;
  /** D'où part chaque véhicule occupé par une tournée PARTIE (L7t-C2) ; absent : minuit du jour (CA2). */
  readonly starts?: ReadonlyMap<string, VehicleStart>;
  /** La place des véhicules et la demande des commandes (CA4) ; absente : rien n'est refusé. */
  readonly capacity?: CompositionCapacity;
  /** Les zones autorisées des véhicules et la zone des commandes ; absentes : partout. */
  readonly zones?: CompositionZones;
}

/**
 * **Insérer** les commandes à répartir dans les tournées existantes (mode
 * `insert`, décision de Hugo du 2026-09-29), avec la même construction et la
 * même amélioration que les tournées neuves (L7b-C1, C2) : chaque commande va
 * à la place qui coûte le moins sur TOUS les véhicules — route, attente,
 * retards pénalisés, tournée ouverte —, sans qu'une tournée dépasse la durée
 * maximale.
 *
 * 🔴 **L'ordre relatif des arrêts placés à la main ne change jamais** (L7b-C3) :
 * ils sont épinglés — on insère entre eux, on ne les réordonne pas, on ne les
 * déplace pas. Ce qui ne tient nulle part va à des tournées neuves, APRÈS
 * celles du véhicule, seulement s'il a encore droit à un passage
 * (`passageLimits`) ; sinon déborde, signalé.
 *
 * Une insertion qui ferait déborder la caisse est refusée (CA4) ; la
 * recherche passe à la meilleure place suivante, sur ce véhicule, un autre,
 * ou un autre passage. Ce que rien ne porte va dans `capacityRefused`.
 * Une commande n'est jamais essayée dans un véhicule non autorisé sur sa zone
 * (`zones`) ; sans aucun véhicule autorisé, elle va dans `zoneRefused`. Un
 * arrêt déjà placé hors de sa zone y reste : il est épinglé.
 *
 * Ne rend que les tournées existantes qui ont reçu un arrêt, puis les neuves.
 * Déterministe.
 */
export function insertIntoRounds(input: InsertionInput): Proposal {
  const vehicles = [...input.vehicles].sort((a, b) => compareIds(a.id, b.id));
  const initial: readonly VehiclePlan[] = vehicles.map((vehicle) => {
    const own = input.rounds
      .filter((round) => round.vehicleId === vehicle.id)
      .sort((a, b) => a.passage - b.passage);
    return {
      vehicle,
      maxRoutes: own.length + (input.passageLimits?.get(vehicle.id) ?? Infinity),
      ...startOf(input, vehicle.id),
      routes: own.map((round) => ({ roundId: round.roundId, stops: round.stops })),
    };
  });
  const pinned = new Set(input.rounds.flatMap((round) => round.stops.map((stop) => stop.id)));
  const pending = [...input.stops].sort((a, b) => compareIds(a.id, b.id));
  const guard = input.capacity === undefined ? NO_CAPACITY_LIMIT : capacityGuardOf(input.capacity);
  const zones = zoneRuleOf(input.zones);
  const built = insertCheapest(input, initial, pending, "after_existing", guard, zones);
  const plans = improvePlans(input, built.plans, pinned, guard, zones);
  const idsOf = (reason: UnplacedReason): readonly string[] =>
    built.unplaced
      .filter((entry) => entry.reason === reason)
      .map(({ stop }) => stop.id)
      .sort(compareIds);
  return {
    tours: plans.flatMap((plan) => toursOf(input, plan, pinned)),
    overflow: idsOf("no_passage"),
    capacityRefused: idsOf("capacity"),
    zoneRefused: idsOf("zone"),
  };
}

/** Les tournées existantes qui ont reçu, puis les neuves ; rang = passage dans le véhicule. */
function toursOf(
  input: InsertionInput,
  plan: VehiclePlan,
  pinned: ReadonlySet<string>,
): readonly ProposedTour[] {
  const timed = timeVehicle(input, plan.routes, plan.availableFrom);
  return plan.routes.flatMap((route, index) => {
    const received = route.stops.some((stop) => !pinned.has(stop.id));
    const clock = timed[index];
    return received && clock !== undefined
      ? [
          tourOf(
            input,
            plan.vehicle,
            plan.passagesBefore + index + 1,
            route.roundId,
            route.stops,
            clock,
          ),
        ]
      : [];
  });
}
