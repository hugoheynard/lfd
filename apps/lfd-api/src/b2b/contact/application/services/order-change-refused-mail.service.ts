import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import type { OrderChangeRefusedEvent } from "../../domain/order-change.events.js";

/**
 * **« Nous n'avons pas pu modifier votre commande »**, avec le mot de
 * l'équipe — au client qui l'a demandée (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4).
 * Mêmes règles que `OrderChangeAppliedMail` : demandé au bloc `mail` dans la
 * transaction du refus (lot S2c).
 */
@Injectable()
export class OrderChangeRefusedMail {
  constructor(private readonly mail: Mail) {}

  /** À appeler DANS l'unité de travail de la réponse. */
  async request(event: OrderChangeRefusedEvent): Promise<void> {
    const { requestId, order } = event.subject;
    await this.mail.send({
      brand: "lfc",
      to: event.request.author.email,
      template: "customer.order-change-refused",
      idempotencyKey: `order-change-refused:${requestId}`,
      data: { reference: order.number, reason: event.reason, locale: DEFAULT_MAIL_LOCALE },
    });
  }
}
