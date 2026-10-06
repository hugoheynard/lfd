import { Injectable, Logger } from "@nestjs/common";

import {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
} from "../../../../delivery/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { DeliveryEnRouteMailFailedError } from "../../domain/errors/delivery-en-route-errors.js";
import { DeliveryEnRouteMail } from "../services/delivery-en-route-mail.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const MAIL_DELIVERY_EN_ROUTE = "b2b.mail-delivery-en-route";

/**
 * **« Votre livraison est en route »** — le commerce entend le départ d'une
 * tournée (`documentation/livraisons/en-route.md`) : un courriel par commande.
 *
 * Abonné DURABLE depuis le 2026-10-06 (`plan-depart-durable.md`, DD1) : un
 * redémarrage entre la validation du départ et l'envoi ne perd plus le
 * courriel. Le relais le livre au premier réveil après la validation.
 *
 * 🔴 **Un échec est journalisé, jamais relancé** (§5) : il ne lève pas. Un
 * courriel « en route » n'est pas critique, et relancer le fait entier
 * renverrait aussi aux clients déjà servis. Les commandes sont tentées une à
 * une, et TOUTES : un envoi raté ne prive pas les suivants du leur. La clé
 * Resend est par commande ET par tournée (`DeliveryEnRouteMail`) : une
 * reprise n'en fait pas un second, un second passage a le sien.
 */
@Injectable()
@DurableHandler({ type: DELIVERY_ROUND_DEPARTED, subscriber: MAIL_DELIVERY_EN_ROUTE })
export class MailDeliveryEnRoute implements DurableSubscriber {
  private readonly logger = new Logger(MailDeliveryEnRoute.name);

  constructor(private readonly mail: DeliveryEnRouteMail) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = DeliveryRoundDepartedFact.fromPayload(delivery.payload);
    const failed: string[] = [];
    let firstCause: unknown = null;
    for (const orderId of fact.orderIds) {
      try {
        await this.mail.send(orderId, fact.roundId);
      } catch (cause: unknown) {
        failed.push(orderId);
        firstCause ??= cause;
      }
    }
    if (failed.length > 0) {
      const error = new DeliveryEnRouteMailFailedError(fact.roundId, failed, firstCause);
      this.logger.error(error.message, error);
    }
  }
}
