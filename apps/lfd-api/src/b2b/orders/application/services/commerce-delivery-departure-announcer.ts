import { Injectable } from "@nestjs/common";

import {
  type DeliveryDeparture,
  DeliveryDepartureAnnouncer,
} from "../../../../delivery/channels/commerce/index.js";
import { DeliveryEnRouteMailFailedError } from "../../domain/errors/delivery-en-route-errors.js";
import { DeliveryEnRouteMail } from "./delivery-en-route-mail.service.js";

/**
 * **Le commerce entend le départ d'une tournée** (`plan-en-route.md`, PL3-D1) :
 * un courriel par commande de la tournée.
 *
 * Les commandes sont tentées une à une, et TOUTES : un envoi raté ne prive pas
 * les clients suivants du leur. Les échecs sont rassemblés en une seule erreur
 * technique, levée à la fin, que le travail de fond journalise.
 */
@Injectable()
export class CommerceDeliveryDepartureAnnouncer extends DeliveryDepartureAnnouncer {
  constructor(private readonly mail: DeliveryEnRouteMail) {
    super();
  }

  async announceDeparture(departure: DeliveryDeparture): Promise<void> {
    const failed: string[] = [];
    let firstCause: unknown = null;
    for (const orderId of departure.orderIds) {
      try {
        await this.mail.send(orderId);
      } catch (cause: unknown) {
        failed.push(orderId);
        firstCause ??= cause;
      }
    }
    if (failed.length > 0) {
      throw new DeliveryEnRouteMailFailedError(departure.roundId, failed, firstCause);
    }
  }
}
