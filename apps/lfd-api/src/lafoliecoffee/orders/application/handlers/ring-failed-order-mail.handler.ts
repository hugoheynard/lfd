import { Injectable, Logger } from "@nestjs/common";
import { staffPermission } from "@lfd/contracts";
import { mailLabel } from "@lfd/mail-blocks";

import {
  type FailedMailDelivery,
  MAIL_DELIVERY_FAILED,
  MailDeliveryFailedEvent,
} from "../../../../mail/channels/deliveries/mail-delivery-failed.event.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OrderNumberReader } from "../../domain/ports/order-number.reader.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RING_FAILED_ORDER_MAIL = "orders.ring-failed-order-mail";

/** Le genre de la cloche. */
export const FAILED_ORDER_MAIL_BELL = "order.mail_failed";

/** Ce que le retour veut dire, et le geste qui en sort. */
const WORDS: Readonly<Record<FailedMailDelivery, string>> = {
  bounced: "adresse rejetée. Vérifiez l'adresse du client.",
  complained: "le client l'a signalé comme indésirable. Appelez-le avant tout nouvel envoi.",
};

/** La clé de la cloche : une par fiche ET par commande (règle 5). */
export function failedOrderMailKey(requestId: string, orderId: string): string {
  return `mail.failed:${requestId}:${orderId}`;
}

/**
 * **« L'e-mail d'une commande n'a pas été reçu »**
 * (`documentation/mail/le-sujet-des-e-mails.md`, E4, règle 5) — le staff
 * peut appeler le client à temps, au lieu de le découvrir au comptoir.
 *
 * Abonné durable du fait `mail.delivery_failed`, déclaré par le canal du
 * bloc `mail` : pour chaque sujet `order`, une cloche adressée au droit
 * `b2b_orders:read`, qui mène à la commande. La clé est par fiche et par
 * commande : le rappel de retrait et l'e-mail « prête » d'origine sont deux
 * fiches, donc deux cloches ; un rejeu du fait ne resonne pas.
 *
 * Le modèle est nommé par son intitulé (« Commande prête »), lu dans la
 * table partagée avec l'éditeur (`@lfd/mail-blocks`, `mailLabel`) ; un test
 * du bloc `mail` refuse une clé du registre qui n'en aurait pas.
 */
@Injectable()
@DurableHandler({ type: MAIL_DELIVERY_FAILED, subscriber: RING_FAILED_ORDER_MAIL })
export class RingFailedOrderMail implements DurableSubscriber {
  private readonly logger = new Logger(RingFailedOrderMail.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly numbers: OrderNumberReader,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const { fields } = MailDeliveryFailedEvent.fromPayload(delivery.payload);
    const orderIds = fields.subjects
      .filter((subject) => subject.type === "order")
      .map((subject) => subject.id);
    if (orderIds.length === 0) {
      return;
    }
    const numbers = await this.numbers.numbersOf(orderIds);
    const notices: StaffNotice[] = [];
    for (const orderId of orderIds) {
      const number = numbers.get(orderId);
      if (number === undefined) {
        this.logger.warn(
          `E-mail non reçu (fiche ${fields.requestId}) pour une commande inconnue (${orderId}) : aucune cloche.`,
        );
        continue;
      }
      notices.push(
        this.noticeOf(fields.requestId, fields.template, fields.delivery, orderId, number),
      );
    }
    if (notices.length > 0) {
      await this.notifier.notify(notices);
    }
  }

  private noticeOf(
    requestId: string,
    template: string,
    failure: FailedMailDelivery,
    orderId: string,
    number: string,
  ): StaffNotice {
    return {
      kind: FAILED_ORDER_MAIL_BELL,
      subject: `E-mail non reçu — ${number}`,
      body: `L'e-mail « ${mailLabel(template).title} » de la commande ${number} n'a pas été reçu : ${WORDS[failure]}`,
      link: `/commandes/${orderId}`,
      idempotencyKey: failedOrderMailKey(requestId, orderId),
      occurredAt: this.clock.now(),
      audience: staffPermission("b2b_orders", "read"),
    };
  }
}
