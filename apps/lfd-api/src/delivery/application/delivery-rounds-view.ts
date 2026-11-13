import type {
  DeliveryRoundDriverView,
  DeliveryRoundOrderRef,
  DeliveryRoundsDayView,
  DeliveryRoundStopSignal,
  DeliveryRoundStopView,
  DeliveryRoundView,
} from "@lfd/contracts";

import type { DeliveryOrderFacts, DeliveryOrderRef } from "../channels/commerce/index.js";
import { activeOnDay } from "../domain/entities/vehicle.js";
import type { RoundPlace } from "../domain/services/round-place.js";
import {
  type RoundsDayComposition,
  roundsDayCompositionOf,
  type RoundsDayReadings,
  type RoundsDayRound,
  type RoundsDayStop,
} from "./rounds-day-composition.js";

/**
 * Ce qui se lit à CHAQUE appel, jamais rangé (Hugo, 2026-11-13) : les
 * livreurs (droits du personnel), la flotte, la place au dépôt (réglages et
 * capacité, tirées de la flotte), les commandes rapportées à replacer, et
 * tout ce qui peut changer sous le numéro d'un AUTRE jour : l'état des
 * commandes composées, et les attendues déjà placées ailleurs.
 */
export interface RoundsDayLive {
  /** Les commandes composées, relues par leur id. */
  readonly composed: ReadonlyMap<string, DeliveryOrderFacts>;
  /** Parmi les attendues, celles qui sont dans une tournée vivante, de n'importe quel jour. */
  readonly assigned: ReadonlySet<string>;
  /** La place de chaque tournée au dépôt, par id ; une tournée partie n'y est pas. */
  readonly places: ReadonlyMap<string, RoundPlace>;
  /**
   * Les fiches qui peuvent livrer, maintenant : elles tiennent EFFECTIVEMENT le
   * droit de conduire ET celui des gestes à la porte (MT-D2 v2 ; audit
   * 2026-10-07, B8).
   */
  readonly drivers: ReadonlySet<string>;
  /** Le nom des livreurs affectés, lu dans l'annuaire ; absent : fiche inconnue. */
  readonly driverNames: ReadonlyMap<string, string | null>;
  /**
   * Les commandes rapportées à replacer (lot RL1), de n'importe quel jour :
   * actives, en livraison, non retirées, dans aucune tournée depuis.
   */
  readonly awaiting: readonly DeliveryOrderRef[];
  /** La dernière fois qu'une commande à replacer ou composée a été rapportée. */
  readonly broughtBack: ReadonlyMap<string, Date>;
  /** Les zones autorisées des véhicules RESTREINTS ; absent : partout (2026-10-06). */
  readonly vehicleZones: ReadonlyMap<string, ReadonlySet<string>>;
  /** Le retrait de chaque véhicule connu de la flotte ; absent : celui de la composition. */
  readonly vehicleRetiredAt: ReadonlyMap<string, Date | null>;
}

/** Ce que la vue du jour assemble d'un seul tenant : la journée et ce qui se lit à chaque appel. */
export type DeliveryRoundsDayInputs = RoundsDayReadings & Omit<RoundsDayLive, "vehicleRetiredAt">;

/**
 * **La composition d'un jour**, calculée par le serveur (C4) : la colonne « à
 * répartir » et les signaux des arrêts. L'écran n'en décide rien.
 *
 * - **à répartir** : attendues ce jour, non annulées, dans aucune tournée
 *   vivante (I3 : une commande composée un autre jour n'est pas à répartir,
 *   elle est signalée là où elle est) — et, EN TÊTE, les commandes rapportées
 *   à replacer, quel que soit le jour composé (lot RL1) ;
 * - **signaux** : `cancelled`, `not_this_day`, `not_delivery` — retirés à la
 *   main (Q11) ; une commande rapportée n'est jamais `not_this_day` ;
 * - **véhicule retiré** : un retrait et une affectation simultanés ont pu
 *   passer (C14) ; on le dit ;
 * - **livreur sans accès** : affecté, puis privé du droit de conduire (MT-D2 v2) ;
 * - **hors zone** : le véhicule n'est pas autorisé sur la zone de l'arrêt
 *   (2026-10-06) — dit, jamais défait.
 *
 * Les signalements de la journée s'y ajoutent dans le handler.
 */
export function deliveryRoundsDayView(
  inputs: DeliveryRoundsDayInputs,
): Omit<DeliveryRoundsDayView, "incidents"> {
  return servedRoundsDay(roundsDayCompositionOf(inputs), {
    ...inputs,
    vehicleRetiredAt: new Map(),
  });
}

/** La composition rangée, servie avec ce qui se lit à chaque appel. */
export function servedRoundsDay(
  composition: RoundsDayComposition,
  live: RoundsDayLive,
): Omit<DeliveryRoundsDayView, "incidents"> {
  return {
    day: composition.day,
    rounds: composition.rounds.map((round) => roundView(round, composition.day, live)),
    unassigned: unassignedOf(composition, live),
  };
}

function unassignedOf(
  composition: RoundsDayComposition,
  live: RoundsDayLive,
): readonly DeliveryRoundOrderRef[] {
  const awaitingIds = new Set(live.awaiting.map((order) => order.orderId));
  return [
    ...live.awaiting.map((order) => ({ orderId: order.orderId, reference: order.reference })),
    ...composition.ofDay.filter(
      (order) => !awaitingIds.has(order.orderId) && !live.assigned.has(order.orderId),
    ),
  ].map((order) => orderRef(order, live.broughtBack.get(order.orderId)));
}

function orderRef(
  order: DeliveryRoundOrderRef,
  broughtBackAt: Date | undefined,
): DeliveryRoundOrderRef {
  const ref = { orderId: order.orderId, reference: order.reference };
  return broughtBackAt === undefined ? ref : { ...ref, broughtBackAt: broughtBackAt.toISOString() };
}

function roundView(round: RoundsDayRound, day: string, live: RoundsDayLive): DeliveryRoundView {
  const { vehicleRetiredAt, driverStaffId, stops, ...fixed } = round;
  const retiredAt = live.vehicleRetiredAt.has(round.vehicleId)
    ? (live.vehicleRetiredAt.get(round.vehicleId) ?? null)
    : vehicleRetiredAt === null
      ? null
      : new Date(vehicleRetiredAt);
  return {
    ...fixed,
    vehicleRetired: !activeOnDay(retiredAt, day),
    driver: driverView(driverStaffId, live),
    stops: stops.map((stop) => stopView(stop, round.vehicleId, day, live)),
    place: live.places.get(round.id) ?? null,
  };
}

/**
 * Le livreur affecté, nom LU dans l'annuaire. `canDrive` faux : il a perdu
 * l'un des deux droits — conduire, ou les gestes à la porte — ou sa fiche est
 * suspendue ; l'écran dit « livreur sans accès — réaffecter » (MT-D2 v2).
 */
function driverView(
  staffUserId: string | null,
  live: RoundsDayLive,
): DeliveryRoundDriverView | null {
  if (staffUserId === null) {
    return null;
  }
  return {
    staffUserId,
    name: live.driverNames.get(staffUserId) ?? null,
    canDrive: live.drivers.has(staffUserId),
  };
}

function stopView(
  stop: RoundsDayStop,
  vehicleId: string,
  day: string,
  live: RoundsDayLive,
): DeliveryRoundStopView {
  const order = live.composed.get(stop.orderId);
  const broughtBackAt = live.broughtBack.get(stop.orderId);
  const view: DeliveryRoundStopView = {
    stopId: stop.stopId,
    orderId: stop.orderId,
    // Une commande que le commerce ne connaît plus (semis de démonstration
    // effacé) n'a pas de numéro : on n'en invente pas.
    reference: order?.reference ?? "",
    position: stop.position,
    signals: order === undefined ? [] : signalsOf(order, day, broughtBackAt !== undefined),
    orderDay: order?.day ?? null,
  };
  const flagged = outOfZone(order?.zoneId ?? null, live.vehicleZones.get(vehicleId))
    ? { ...view, outOfZone: true }
    : view;
  const clientele = order?.clientele ?? null;
  const colored = clientele === null ? flagged : { ...flagged, clientele };
  return broughtBackAt === undefined
    ? colored
    : { ...colored, broughtBackAt: broughtBackAt.toISOString() };
}

/** Un véhicule restreint, et une commande d'une zone qu'il n'a pas. Sans zone : partout. */
function outOfZone(zoneId: string | null, allowed: ReadonlySet<string> | undefined): boolean {
  return zoneId !== null && allowed !== undefined && !allowed.has(zoneId);
}

function signalsOf(
  order: DeliveryOrderFacts,
  day: string,
  broughtBack: boolean,
): readonly DeliveryRoundStopSignal[] {
  const signals: DeliveryRoundStopSignal[] = [];
  if (order.status === "cancelled") {
    signals.push("cancelled");
  }
  if (order.day !== day && !broughtBack) {
    signals.push("not_this_day");
  }
  if (!order.delivery) {
    signals.push("not_delivery");
  }
  return signals;
}
