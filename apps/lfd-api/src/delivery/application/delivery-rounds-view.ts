import type {
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
}

/**
 * **La composition d'un jour**, calculée par le serveur (C4) : la colonne « à
 * répartir » et les signaux des arrêts. L'écran n'en décide rien.
 *
 * - **à répartir** : attendues ce jour, non annulées, dans aucune tournée
 *   vivante (I3 : une commande composée un autre jour n'est pas à répartir,
 *   elle est signalée là où elle est) ;
 * - **signaux** : `cancelled`, `not_this_day`, `not_delivery` — retirés à la
 *   main (Q11) ;
 * - **véhicule retiré** : un retrait et une affectation simultanés ont pu
 *   passer (C14) ; on le dit.
 */
export function deliveryRoundsDayView(inputs: DeliveryRoundsDayInputs): DeliveryRoundsDayView {
  return {
    day: inputs.day,
    rounds: inputs.rounds.map((round) => roundView(round, inputs)),
    unassigned: inputs.expected
      .filter((order) => order.status !== "cancelled" && !inputs.assigned.has(order.orderId))
      .map((order): DeliveryRoundOrderRef => ({
        orderId: order.orderId,
        reference: order.reference,
      })),
  };
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
    stops: round.stops.map((stop) => stopView(stop, inputs)),
  };
}

function stopView(stop: RoundStopRow, inputs: DeliveryRoundsDayInputs): DeliveryRoundStopView {
  const order = inputs.composed.get(stop.orderId);
  return {
    stopId: stop.stopId,
    orderId: stop.orderId,
    // Une commande que le commerce ne connaît plus (semis de démonstration
    // effacé) n'a pas de numéro : on n'en invente pas.
    reference: order?.reference ?? "",
    position: stop.position,
    signals: order === undefined ? [] : signalsOf(order, inputs.day),
    orderDay: order?.day ?? null,
  };
}

function signalsOf(order: DeliveryOrderFacts, day: string): readonly DeliveryRoundStopSignal[] {
  const signals: DeliveryRoundStopSignal[] = [];
  if (order.status === "cancelled") {
    signals.push("cancelled");
  }
  if (order.day !== day) {
    signals.push("not_this_day");
  }
  if (!order.delivery) {
    signals.push("not_delivery");
  }
  return signals;
}
