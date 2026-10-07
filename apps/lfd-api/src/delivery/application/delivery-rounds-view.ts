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
import type { RoundRow, RoundStopRow } from "../domain/ports/delivery-rounds.reader.js";

/** Ce que la vue du jour assemble : trois lectures faites au même moment. */
export interface DeliveryRoundsDayInputs {
  readonly day: string;
  readonly rounds: readonly RoundRow[];
  /** Les livraisons attendues ce jour, annulées comprises. */
  readonly expected: readonly DeliveryOrderRef[];
  /** Les commandes composées, relues par leur id. */
  readonly composed: ReadonlyMap<string, DeliveryOrderFacts>;
  /** Parmi les attendues, celles qui sont dans une tournée vivante, de n'importe quel jour. */
  readonly assigned: ReadonlySet<string>;
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
}

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
 * Les signalements de la journée s'y ajoutent dans le handler : ils ne
 * dépendent d'aucune de ces entrées.
 */
export function deliveryRoundsDayView(
  inputs: DeliveryRoundsDayInputs,
): Omit<DeliveryRoundsDayView, "incidents"> {
  return {
    day: inputs.day,
    rounds: inputs.rounds.map((round) => roundView(round, inputs)),
    unassigned: unassignedOf(inputs),
  };
}

function unassignedOf(inputs: DeliveryRoundsDayInputs): readonly DeliveryRoundOrderRef[] {
  const awaitingIds = new Set(inputs.awaiting.map((order) => order.orderId));
  const ofDay = inputs.expected.filter(
    (order) =>
      order.status !== "cancelled" &&
      !inputs.assigned.has(order.orderId) &&
      !awaitingIds.has(order.orderId),
  );
  return [...inputs.awaiting, ...ofDay].map((order) =>
    orderRef(order, inputs.broughtBack.get(order.orderId)),
  );
}

function orderRef(order: DeliveryOrderRef, broughtBackAt: Date | undefined): DeliveryRoundOrderRef {
  const ref = { orderId: order.orderId, reference: order.reference };
  return broughtBackAt === undefined ? ref : { ...ref, broughtBackAt: broughtBackAt.toISOString() };
}

function roundView(round: RoundRow, inputs: DeliveryRoundsDayInputs): DeliveryRoundView {
  return {
    id: round.id,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    version: round.version,
    vehicleRetired: !activeOnDay(round.vehicleRetiredAt, inputs.day),
    departedAt: round.departedAt?.toISOString() ?? null,
    returnedAt: round.returnedAt?.toISOString() ?? null,
    planned:
      round.planned === null
        ? null
        : {
            departureAt: round.planned.departureAt.toISOString(),
            returnAt: round.planned.returnAt.toISOString(),
            meters: round.planned.meters,
          },
    driver: driverView(round.driverStaffId, inputs),
    stops: round.stops.map((stop) => stopView(stop, round.vehicleId, inputs)),
  };
}

/**
 * Le livreur affecté, nom LU dans l'annuaire. `canDrive` faux : il a perdu
 * l'un des deux droits — conduire, ou les gestes à la porte — ou sa fiche est
 * suspendue ; l'écran dit « livreur sans accès — réaffecter » (MT-D2 v2).
 */
function driverView(
  staffUserId: string | null,
  inputs: DeliveryRoundsDayInputs,
): DeliveryRoundDriverView | null {
  if (staffUserId === null) {
    return null;
  }
  return {
    staffUserId,
    name: inputs.driverNames.get(staffUserId) ?? null,
    canDrive: inputs.drivers.has(staffUserId),
  };
}

function stopView(
  stop: RoundStopRow,
  vehicleId: string,
  inputs: DeliveryRoundsDayInputs,
): DeliveryRoundStopView {
  const order = inputs.composed.get(stop.orderId);
  const broughtBackAt = inputs.broughtBack.get(stop.orderId);
  const view: DeliveryRoundStopView = {
    stopId: stop.stopId,
    orderId: stop.orderId,
    // Une commande que le commerce ne connaît plus (semis de démonstration
    // effacé) n'a pas de numéro : on n'en invente pas.
    reference: order?.reference ?? "",
    position: stop.position,
    signals: order === undefined ? [] : signalsOf(order, inputs.day, broughtBackAt !== undefined),
    orderDay: order?.day ?? null,
  };
  const flagged = outOfZone(order?.zoneId ?? null, inputs.vehicleZones.get(vehicleId))
    ? { ...view, outOfZone: true }
    : view;
  return broughtBackAt === undefined
    ? flagged
    : { ...flagged, broughtBackAt: broughtBackAt.toISOString() };
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
