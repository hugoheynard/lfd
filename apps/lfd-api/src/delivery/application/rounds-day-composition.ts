import type {
  DeliveryRoundOrderRef,
  DeliveryRoundTransferStopView,
  DeliveryRoundView,
} from "@lfd/contracts";

import type { DeliveryOrderRef } from "../channels/commerce/index.js";
import { orderStopsOf, transferStopsOf } from "../domain/entities/delivery-round-state.js";
import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";

/**
 * Un arrêt de commande tel que la journée le fixe : sa place seulement. Ce
 * que le commerce dit de la commande (annulée, jour, zone…) se lit à chaque
 * appel : elle peut être d'un autre jour, dont aucun numéro de CETTE
 * journée ne suit les changements.
 */
export interface RoundsDayStop {
  readonly stopId: string;
  readonly orderId: string;
  readonly position: number;
}

/** Une tournée de la journée, sans son livreur lu, sa place ni l'état de son véhicule. */
export interface RoundsDayRound extends Omit<
  DeliveryRoundView,
  "vehicleRetired" | "driver" | "stops" | "place" | "transferStops"
> {
  /** Lu à la composition ; remplacé à chaque appel par la flotte quand elle connaît le véhicule. */
  readonly vehicleRetiredAt: string | null;
  readonly driverStaffId: string | null;
  readonly stops: readonly RoundsDayStop[];
  readonly transferStops: readonly DeliveryRoundTransferStopView[];
}

/**
 * **La composition d'un jour, sans ce qui se lit à chaque appel** — ce que
 * l'objet des journées range sous les numéros `delivery` et `orders`. Rien
 * n'y vient des livreurs, de la flotte, des réglages ni des commandes
 * rapportées : `servedRoundsDay` les y pose. Sérialisable tel quel (dates
 * en ISO, aucune `Map`).
 */
export interface RoundsDayComposition {
  readonly day: string;
  readonly rounds: readonly RoundsDayRound[];
  /**
   * Attendues ce jour, non annulées. Celles déjà dans une tournée vivante —
   * de n'importe quel jour — sont retirées à chaque appel.
   */
  readonly ofDay: readonly DeliveryRoundOrderRef[];
}

/** Les lectures de la journée que la composition fixe. */
export interface RoundsDayReadings {
  readonly day: string;
  readonly rounds: readonly RoundRow[];
  /** Les livraisons attendues ce jour, annulées comprises. */
  readonly expected: readonly DeliveryOrderRef[];
}

export function roundsDayCompositionOf(readings: RoundsDayReadings): RoundsDayComposition {
  return {
    day: readings.day,
    rounds: readings.rounds.map(roundOf),
    ofDay: readings.expected
      .filter((order) => order.status !== "cancelled")
      .map((order) => ({ orderId: order.orderId, reference: order.reference })),
  };
}

function roundOf(round: RoundRow): RoundsDayRound {
  return {
    id: round.id,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    version: round.version,
    vehicleRetiredAt: round.vehicleRetiredAt?.toISOString() ?? null,
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
    driverStaffId: round.driverStaffId,
    stops: orderStopsOf(round.stops).map((stop) => ({
      stopId: stop.stopId,
      orderId: stop.orderId,
      position: stop.position,
    })),
    transferStops: transferStopsOf(round.stops).map((stop) => {
      const transfer = round.transfers.get(stop.transferId);
      return {
        stopId: stop.stopId,
        transferId: stop.transferId,
        siteLabel: transfer?.siteLabel ?? "",
        ...(transfer === undefined ? {} : { siteId: transfer.siteId }),
        position: stop.position,
        orderCount: transfer?.orderCount ?? 0,
        resupplyCount: transfer?.resupplyCount ?? 0,
      };
    }),
  };
}
