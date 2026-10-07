import type { CostFn } from "../ports/distance-matrix.js";
import {
  type CapacityGuard,
  capacityGuardOf,
  type CompositionCapacity,
  NO_CAPACITY_LIMIT,
} from "./capacity-guard.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";
import { compareIds } from "./compare-ids.js";
import { improvePlans } from "./improve-plans.js";
import { insertCheapest } from "./insert-cheapest.js";
import type { PlanningContext, PlanningVehicle, Proposal, ProposedTour } from "./proposal.js";
import { durationOf, type RoutingStop, type TimedRoute, timeRoute } from "./route-timing.js";
import {
  clockOf,
  freeStart,
  isBetterScore,
  maxSecondsOf,
  scoreVehicle,
  timeVehicle,
  type VehiclePlan,
  type VehicleScore,
  type VehicleStart,
} from "./vehicle-plan.js";
import { sectorRuleOf, sectorsOf } from "./sectors.js";
import { type CompositionZones, type ZoneRule, zoneRuleOf } from "./zone-rule.js";

/** Un arrêt à placer : la commande (son id est celui de la matrice), sa fenêtre, sa tournée actuelle. */
export interface PlannableStop extends RoutingStop {
  /** La tournée recomposable qui le porte aujourd'hui, ou `null` : à répartir. */
  readonly homeRoundId: string | null;
}

/** Une tournée existante que la proposition peut réutiliser (non partie, rien de chargé). */
export interface RecomposableRound {
  readonly roundId: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
}

export interface ProposalInput {
  readonly depotId: string;
  readonly stops: readonly PlannableStop[];
  readonly vehicles: readonly PlanningVehicle[];
  readonly recomposable: readonly RecomposableRound[];
  readonly cost: CostFn;
  readonly settings: RoutingSettings;
  /**
   * Combien de tournées NEUVES ou reprises chaque véhicule peut encore
   * recevoir ; absent : autant qu'il en faut. Un seul passage permis et une
   * tournée déjà gardée : 0.
   */
  readonly passageLimits?: ReadonlyMap<string, number>;
  /**
   * D'où part chaque véhicule OCCUPÉ par une tournée gardée chargée ou partie
   * (L7t-C2, `busyStarts`) ; absent : libre dès minuit du jour (CA2).
   */
  readonly starts?: ReadonlyMap<string, VehicleStart>;
  /** La place des véhicules et la demande des commandes (CA4) ; absente : rien n'est refusé. */
  readonly capacity?: CompositionCapacity;
  /** Les zones autorisées des véhicules et la zone des commandes ; absentes : partout. */
  readonly zones?: CompositionZones;
}

/** D'où part ce véhicule : son retour estimé s'il est occupé, sinon minuit du jour (CA2). */
export function startOf(
  input: PlanningContext & { readonly starts?: ReadonlyMap<string, VehicleStart> },
  vehicleId: string,
): VehicleStart {
  return input.starts?.get(vehicleId) ?? freeStart(input);
}

/**
 * **La proposition en tournées neuves** (L7b-C1 à C3) : les arrêts sont
 * posés un à un, créneaux les plus serrés d'abord, là où ils coûtent le moins
 * sur TOUS les véhicules à la fois — route, attente, minutes hors créneau
 * lourdement pénalisées, tournée ouverte comptée —, puis la répartition est
 * améliorée par gestes locaux tant que le coût baisse. Un second passage
 * n'existe que si la journée ne tient pas autrement : il coûte une tournée
 * ouverte, que la tournée existante évite dès qu'elle peut prendre l'arrêt.
 *
 * Une place qui ferait déborder la caisse n'en est pas une (CA4,
 * `capacity`) : ce que rien ne peut porter est rendu dans
 * `capacityRefused`, jamais posé en surcharge. Un véhicule non autorisé
 * sur la zone d'une commande ne la reçoit jamais (`zones`) ; ce qu'aucun
 * véhicule autorisé ne peut prendre est rendu dans `zoneRefused`.
 *
 * Ce qui ne tient nulle part — plus de passage permis — déborde : à répartir, signalé, jamais
 * tronqué en silence. S'il vient d'une tournée existante, il y RESTE, en
 * dernier, et la tournée est signalée trop longue — la proposition ne défait
 * jamais un placement qu'elle ne sait pas refaire.
 *
 * Les passages d'un véhicule reprennent ses tournées recomposables dans
 * l'ordre de leur passage ; au-delà, des tournées à ouvrir. Un véhicule
 * occupé par une tournée chargée ou partie (`starts`, L7t-C2) ne part qu'à
 * son retour estimé, et ses passages se numérotent après elle.
 *
 * Pure et déterministe (L7-C12) : même entrée, même proposition.
 */
export function proposeRounds(input: ProposalInput): Proposal {
  const vehicles = [...input.vehicles].sort((a, b) => compareIds(a.id, b.id));
  const stops = [...input.stops].sort((a, b) => compareIds(a.id, b.id));
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const initial: readonly VehiclePlan[] = vehicles.map((vehicle) => ({
    vehicle,
    maxRoutes: input.passageLimits?.get(vehicle.id) ?? Infinity,
    ...startOf(input, vehicle.id),
    routes: [],
  }));
  const guard = input.capacity === undefined ? NO_CAPACITY_LIMIT : capacityGuardOf(input.capacity);
  const zones = zoneRuleOf(input.zones);
  const { built, plans } = bestComposition(input, initial, stops, guard, zones);
  const tours = plans.flatMap((plan) => toursOf(input, plan));
  const spilled = built.unplaced.flatMap(({ stop }) => byId.get(stop.id) ?? []);
  const idsOf = (reason: "capacity" | "zone"): readonly string[] =>
    built.unplaced
      .filter((entry) => entry.reason === reason)
      .map(({ stop }) => stop.id)
      .sort(compareIds);
  const refused = new Set([...idsOf("capacity"), ...idsOf("zone")]);
  return {
    tours: keepAtHome(input, tours, spilled),
    overflow: spilled
      .filter((stop) => stop.homeRoundId === null && !refused.has(stop.id))
      .map((stop) => stop.id)
      .sort(compareIds),
    capacityRefused: idsOf("capacity"),
    zoneRefused: idsOf("zone"),
  };
}

interface Composition {
  readonly built: ReturnType<typeof insertCheapest>;
  readonly plans: readonly VehiclePlan[];
}

/**
 * **Deux départs, le meilleur gardé** (Hugo, 2026-10-07 : « une camionnette
 * peut faire des tours dans un plus faible rayon »). L'amélioration pas à pas
 * ne quitte pas la répartition de départ : partie de l'insertion seule, elle
 * mêle loin et près dans chaque camionnette. Partie de SECTEURS
 * (`sectorsOf`), elle rend des tournées plus serrées et moins chères sur le
 * banc (coût −11 %, 2026-10-07).
 *
 * Les secteurs seuls ne suffisent pas : un secteur par véhicule ouvre deux
 * tournées là où une seule suffit (journée enregistrée, 434 min contre 388),
 * et un Kangoo plein dans son coin laisse une commande à répartir. On compose
 * donc les deux, et l'on garde le moins de commandes à répartir, puis le
 * moins de retard, puis le moindre coût : jamais pire qu'avant. Le prix est
 * le temps — deux compositions au lieu d'une (`todo-calculateur.md`).
 */
function bestComposition(
  input: ProposalInput,
  initial: readonly VehiclePlan[],
  stops: readonly PlannableStop[],
  guard: CapacityGuard,
  zones: ZoneRule,
): Composition {
  const plain = compose(input, initial, stops, guard, zones, zones);
  const sectors = sectorsOf(
    input,
    stops,
    initial.map((plan) => ({ id: plan.vehicle.id, passages: plan.maxRoutes })),
    input.capacity,
  );
  if (sectors.size === 0) {
    return plain;
  }
  const sectored = compose(input, initial, stops, guard, sectorRuleOf(sectors, zones), zones);
  return isBetterComposition(input, sectored, plain) ? sectored : plain;
}

/** Placer d'abord sous `seed`, puis ce qui reste sous `zones`, puis améliorer sous `zones`. */
function compose(
  input: ProposalInput,
  initial: readonly VehiclePlan[],
  stops: readonly PlannableStop[],
  guard: CapacityGuard,
  seed: ZoneRule,
  zones: ZoneRule,
): Composition {
  const first = insertCheapest(input, initial, stops, "anywhere", guard, seed);
  const built =
    seed === zones || first.unplaced.length === 0
      ? first
      : insertCheapest(
          input,
          first.plans,
          first.unplaced.map(({ stop }) => stop),
          "anywhere",
          guard,
          zones,
        );
  return { built, plans: improvePlans(input, built.plans, new Set(), guard, zones) };
}

function isBetterComposition(input: ProposalInput, a: Composition, b: Composition): boolean {
  if (a.built.unplaced.length !== b.built.unplaced.length) {
    return a.built.unplaced.length < b.built.unplaced.length;
  }
  return isBetterScore(totalScoreOf(input, a.plans), totalScoreOf(input, b.plans));
}

function totalScoreOf(input: ProposalInput, plans: readonly VehiclePlan[]): VehicleScore {
  return plans.reduce(
    (sum, plan) => {
      const score = scoreVehicle(input, plan.routes, plan);
      return { lateSeconds: sum.lateSeconds + score.lateSeconds, cost: sum.cost + score.cost };
    },
    { lateSeconds: 0, cost: 0 },
  );
}

/** Les tournées d'un véhicule, chronométrées ; elles reprennent ses recomposables dans l'ordre. */
function toursOf(input: ProposalInput, plan: VehiclePlan): readonly ProposedTour[] {
  const rounds = input.recomposable
    .filter((round) => round.vehicleId === plan.vehicle.id)
    .sort((a, b) => a.passage - b.passage);
  const timed = timeVehicle(input, plan.routes, plan.availableFrom);
  return plan.routes.flatMap(({ stops }, index) => {
    const route = timed[index];
    const rank = plan.passagesBefore + index + 1;
    return route === undefined
      ? []
      : [tourOf(input, plan.vehicle, rank, rounds[index]?.roundId ?? null, stops, route)];
  });
}

/** Les débordés qui avaient une tournée y restent, en dernier. */
function keepAtHome(
  input: ProposalInput,
  tours: readonly ProposedTour[],
  spilled: readonly PlannableStop[],
): readonly ProposedTour[] {
  const result = [...tours];
  const homes = [...new Set(spilled.flatMap((stop) => stop.homeRoundId ?? []))].sort(compareIds);
  for (const roundId of homes) {
    const staying = spilled.filter((stop) => stop.homeRoundId === roundId);
    const index = result.findIndex((tour) => tour.roundId === roundId);
    const existing = result[index];
    if (existing !== undefined) {
      const stops = [...existing.stops, ...staying];
      const timed = timeRoute(
        input.depotId,
        stops,
        input.cost,
        clockOf(input, floorOf(input, result, existing)),
      );
      result[index] = tourOf(input, vehicleOf(existing), existing.rank, roundId, stops, timed);
      continue;
    }
    const round = input.recomposable.find((candidate) => candidate.roundId === roundId);
    if (round === undefined) {
      continue;
    }
    const own = result.filter((tour) => tour.vehicleId === round.vehicleId);
    const start = startOf(input, round.vehicleId);
    const earliest = Math.max(start.availableFrom, ...own.map((tour) => tour.timed.return));
    const vehicle = { id: round.vehicleId, name: round.vehicleName };
    const timed = timeRoute(input.depotId, staying, input.cost, clockOf(input, earliest));
    const rank = start.passagesBefore + own.length + 1;
    result.push(tourOf(input, vehicle, rank, roundId, staying, timed));
  }
  return result;
}

/**
 * Le plancher d'une tournée qu'on rallonge (CA2) : le retour du passage qui
 * la précède sur son véhicule, sinon le départ libre du véhicule — pas son
 * ancien départ, que les arrêts ajoutés peuvent obliger à avancer.
 */
function floorOf(input: ProposalInput, tours: readonly ProposedTour[], tour: ProposedTour): number {
  const before = tours.filter(
    (other) => other.vehicleId === tour.vehicleId && other.rank < tour.rank,
  );
  return Math.max(
    startOf(input, tour.vehicleId).availableFrom,
    ...before.map((other) => other.timed.return),
  );
}

function vehicleOf(tour: ProposedTour): PlanningVehicle {
  return { id: tour.vehicleId, name: tour.vehicleName };
}

/** Une tournée proposée ; trop longue, elle est signalée. */
export function tourOf(
  ctx: PlanningContext,
  vehicle: PlanningVehicle,
  rank: number,
  roundId: string | null,
  stops: readonly RoutingStop[],
  timed: TimedRoute,
): ProposedTour {
  return {
    roundId,
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    rank,
    stops,
    timed,
    overDuration: durationOf(timed) > maxSecondsOf(ctx),
  };
}
