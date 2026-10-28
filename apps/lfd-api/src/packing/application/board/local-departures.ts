import { instantToLocal } from "@lfd/contracts";

import type { OrderDeparture } from "../../channels/delivery/index.js";
import type { LocalDeparture } from "../../domain/services/ready-by.js";

/**
 * Les départs lus à l'heure de Paris — celle du poste et des créneaux.
 * Partagé par le poste et par « ce qui attend le four » : la même heure
 * « prête pour » des deux côtés.
 */
export function localDepartures(
  departures: readonly OrderDeparture[],
): ReadonlyMap<string, LocalDeparture> {
  return new Map(
    departures.map((departure) => {
      const local = instantToLocal(departure.at);
      return [departure.orderId, { day: local.day, time: local.time, via: departure.via }];
    }),
  );
}
