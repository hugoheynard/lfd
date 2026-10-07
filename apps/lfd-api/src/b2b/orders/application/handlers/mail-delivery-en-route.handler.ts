import { Injectable, Logger } from "@nestjs/common";

import {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
} from "../../../../delivery/channels/commerce/index.js";
import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
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
 * tournée (`documentation/livraisons/livreur/en-route.md`) : un courriel par commande.
 *
 * Abonné DURABLE depuis le 2026-10-06 (DD1) : le relais le livre au premier
 * réveil après la validation du départ, et le balayage rattrape un réveil
 * manqué.
 *
 * 🔴 **Les envois partent APRÈS la validation du reçu, hors de la
 * transaction** (2026-10-07, audit B1). La garde fait tourner l'abonné dans la
 * transaction qui pose son reçu : y appeler Resend une commande après l'autre
 * tenait une connexion du pool le temps des allers-retours, et une tournée
 * longue pouvait dépasser le délai de la transaction — reçu annulé, fait
 * relivré, chaque envoi redemandé à Resend. Seul le décodage du fait reste
 * dans la transaction : une charge illisible lève, la livraison échoue et
 * sera rejouée.
 *
 * **Un échec est journalisé, jamais relancé** : un courriel « en route » n'est
 * pas critique, et le reçu est déjà validé quand les envois partent. Les
 * commandes sont tentées une à une, et TOUTES : un envoi raté ne prive pas les
 * suivants du leur. La clé Resend est par commande ET par tournée
 * (`DeliveryEnRouteMail`) : un second passage a le sien.
 *
 * ⚠️ La contrepartie : un redémarrage pendant les envois perd ceux qui
 * restaient. La fenêtre va de la validation du reçu au dernier envoi ; avant
 * DD1, elle couvrait tout le trajet depuis la validation du départ.
 */
@Injectable()
@DurableHandler({ type: DELIVERY_ROUND_DEPARTED, subscriber: MAIL_DELIVERY_EN_ROUTE })
export class MailDeliveryEnRoute implements DurableSubscriber {
  private readonly logger = new Logger(MailDeliveryEnRoute.name);

  constructor(
    private readonly mail: DeliveryEnRouteMail,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  /**
   * Décode le fait, puis inscrit les envois pour après la validation. Rien
   * n'est attendu ici : une charge illisible lève avant toute inscription, et
   * la garde, qui appelle depuis sa transaction, reçoit l'échec.
   */
  handle(delivery: DurableDelivery): Promise<void> {
    const fact = DeliveryRoundDepartedFact.fromPayload(delivery.payload);
    this.afterCommit.defer(
      () => this.work.track(this.sendAll(fact), MAIL_DELIVERY_EN_ROUTE),
      MAIL_DELIVERY_EN_ROUTE,
    );
    return Promise.resolve();
  }

  /** Une commande après l'autre, toutes tentées ; ne lève jamais. */
  private async sendAll(fact: DeliveryRoundDepartedFact): Promise<void> {
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
