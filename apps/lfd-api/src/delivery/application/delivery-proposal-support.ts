import type { DeliveryKeptRoundReason } from "@lfd/contracts";

import type { DeliveryOrderFacts } from "../channels/commerce/index.js";
import { activeOnDay } from "../domain/entities/vehicle.js";
import { VehicleInactiveOnDayError } from "../domain/errors/delivery-round-errors.js";
import {
  NoVehicleForProposalError,
  RoutingVehicleNotFoundError,
} from "../domain/errors/delivery-routing-errors.js";
import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { FleetReader } from "../domain/ports/fleet.reader.js";
import type { PlanningVehicle } from "../domain/services/proposal.js";
import type { LocatedStop } from "./delivery-routing-support.js";

/**
 * Les véhicules de la proposition (L7-C5) : ceux qu'on a cochés, sinon tous
 * ceux qui roulent ce jour-là.
 *
 * @throws {RoutingVehicleNotFoundError} un véhicule coché inconnu.
 * @throws {VehicleInactiveOnDayError} un véhicule coché retiré avant ce jour.
 * @throws {NoVehicleForProposalError} aucun véhicule ne roule.
 */
export async function chosenVehicles(
  fleet: FleetReader,
  day: string,
  vehicleIds: readonly string[] | null,
): Promise<readonly PlanningVehicle[]> {
  const all = await fleet.list();
  const active = (retiredAt: string | null): boolean =>
    activeOnDay(retiredAt === null ? null : new Date(retiredAt), day);
  if (vehicleIds === null) {
    const rolling = all.filter((vehicle) => active(vehicle.retiredAt));
    if (rolling.length === 0) {
      throw new NoVehicleForProposalError(day);
    }
    return rolling.map(({ id, name }) => ({ id, name }));
  }
  return [...new Set(vehicleIds)].map((id) => {
    const vehicle = all.find((candidate) => candidate.id === id);
    if (vehicle === undefined) {
      throw new RoutingVehicleNotFoundError(id);
    }
    if (!active(vehicle.retiredAt)) {
      throw new VehicleInactiveOnDayError(vehicle.name, day);
    }
    return { id: vehicle.id, name: vehicle.name };
  });
}

/** Une tournée du jour que la proposition garde telle quelle. */
export interface KeptRound {
  readonly round: RoundRow;
  readonly reason: DeliveryKeptRoundReason;
}

/**
 * **Ce que la proposition a le droit de toucher** (L7-C5, L7-Q2). Jamais une
 * tournée partie, jamais une tournée où un bac est chargé. Sans « tout
 * recomposer », aucune autre non plus. Et une tournée dont un arrêt est signalé
 * (à retirer à la main, Q11) ou non situé reste telle quelle : la proposition
 * ne défait pas un placement qu'elle ne saurait pas refaire — ni une tournée
 * dont un arrêt n'a pas de demande en bacs connue (CA4) : sa place n'y serait
 * pas vérifiable. Une commande
 * RAPPORTÉE placée un autre jour que sa date demandée n'est pas signalée pour
 * cette seule raison (`decisions-par-defaut-2026-10-02.md`, § 4).
 */
export function classifyRounds(input: {
  readonly day: string;
  readonly rounds: readonly RoundRow[];
  readonly loadedStopIds: ReadonlySet<string>;
  readonly facts: ReadonlyMap<string, DeliveryOrderFacts>;
  /** Les commandes composées qui ont été rapportées : un autre jour ne les signale pas (RL1). */
  readonly broughtBack: ReadonlySet<string>;
  readonly located: ReadonlyMap<string, LocatedStop>;
  /** Les commandes dont on ne connaît pas les bacs (CA4). */
  readonly unknownDemand: ReadonlySet<string>;
  readonly recomposeAll: boolean;
}): { readonly recomposable: readonly RoundRow[]; readonly kept: readonly KeptRound[] } {
  const recomposable: RoundRow[] = [];
  const kept: KeptRound[] = [];
  for (const round of input.rounds) {
    const reason = keptReason(round, input);
    if (reason === null) {
      recomposable.push(round);
    } else {
      kept.push({ round, reason });
    }
  }
  return { recomposable, kept };
}

function keptReason(
  round: RoundRow,
  input: Parameters<typeof classifyRounds>[0],
): DeliveryKeptRoundReason | null {
  if (round.departedAt !== null) {
    return "departed";
  }
  if (round.stops.some((stop) => input.loadedStopIds.has(stop.stopId))) {
    return "loaded";
  }
  if (!input.recomposeAll) {
    return "not_requested";
  }
  const signaled = round.stops.some((stop) => {
    const order = input.facts.get(stop.orderId);
    return (
      order === undefined ||
      order.status === "cancelled" ||
      !order.delivery ||
      (order.day !== input.day && !input.broughtBack.has(stop.orderId))
    );
  });
  if (signaled) {
    return "signaled_stop";
  }
  const unlocated = round.stops.some(
    (stop) => (input.located.get(stop.orderId)?.point ?? null) === null,
  );
  if (unlocated) {
    return "unlocated_stop";
  }
  return round.stops.some((stop) => input.unknownDemand.has(stop.orderId))
    ? "unknown_demand_stop"
    : null;
}

/**
 * **Où insérer** (mode `insert`) : les tournées au dépôt des véhicules cochés,
 * dont chaque arrêt est situé — sans quoi on ne saurait pas chronométrer ce
 * qu'on y ajoute — ni de dire si ce qu'on y ajoute tient dans la caisse
 * quand un arrêt n'a pas de demande en bacs connue (CA4). Une tournée chargée
 * reste éligible : Hugo a dit « non parties » (2026-09-29) ; l'arrêt inséré
 * n'a pas de bac, et « Partir » le dira.
 */
export function insertableRounds(input: {
  readonly rounds: readonly RoundRow[];
  readonly vehicleIds: ReadonlySet<string>;
  readonly located: ReadonlyMap<string, LocatedStop>;
  readonly unknownDemand: ReadonlySet<string>;
}): { readonly insertable: readonly RoundRow[]; readonly kept: readonly KeptRound[] } {
  const insertable: RoundRow[] = [];
  const kept: KeptRound[] = [];
  for (const round of input.rounds) {
    if (round.departedAt !== null) {
      kept.push({ round, reason: "departed" });
    } else if (!input.vehicleIds.has(round.vehicleId)) {
      kept.push({ round, reason: "not_requested" });
    } else if (
      round.stops.some((stop) => (input.located.get(stop.orderId)?.point ?? null) === null)
    ) {
      kept.push({ round, reason: "unlocated_stop" });
    } else if (round.stops.some((stop) => input.unknownDemand.has(stop.orderId))) {
      kept.push({ round, reason: "unknown_demand_stop" });
    } else {
      insertable.push(round);
    }
  }
  return { insertable, kept };
}

/**
 * Combien de tournées chaque véhicule peut encore recevoir (Q13) : sans
 * limite si plusieurs passages sont permis ; sinon une, moins celles qu'il
 * garde déjà ce jour-là.
 */
export function passageLimitsOf(
  multiplePassages: boolean,
  vehicles: readonly PlanningVehicle[],
  staying: readonly RoundRow[],
): ReadonlyMap<string, number> {
  if (multiplePassages) {
    return new Map();
  }
  return new Map(
    vehicles.map((vehicle) => [
      vehicle.id,
      Math.max(0, 1 - staying.filter((round) => round.vehicleId === vehicle.id).length),
    ]),
  );
}
