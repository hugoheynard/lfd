import { Injectable } from "@nestjs/common";

import { MailRequests } from "../../../../mail/channels/requests/mail-requests.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import type { OrderChangeAppliedEvent } from "../../domain/order-change.events.js";

/**
 * **« Votre modification est faite »** — au client qui l'a demandée, à
 * l'adresse prise à son compte, avec le nouveau total et l'écart, lus sur la
 * révision appliquée (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4, §14).
 *
 * **Demandé au bloc `mail`** dans la transaction qui applique la révision
 * (lot S2c, `plan-service-e-mails.md`) : la réponse et son courriel tombent
 * ensemble. C'était un abonné en mémoire, que `lint:durable-cross-block`
 * refuse d'appeler la porte d'un autre bloc. La clé d'idempotence porte l'id
 * de la demande : une demande n'est appliquée qu'une fois.
 */
@Injectable()
export class OrderChangeAppliedMail {
  constructor(private readonly mails: MailRequests) {}

  /** À appeler DANS l'unité de travail de la réponse. */
  async request(event: OrderChangeAppliedEvent): Promise<void> {
    const { requestId, order } = event.subject;
    await this.mails.request({
      brand: "lfc",
      to: event.request.author.email,
      template: "customer.order-change-applied",
      idempotencyKey: `order-change-applied:${requestId}`,
      data: {
        reference: order.number,
        totalCents: event.applied.totalCents,
        previousTotalCents: event.applied.previousTotalCents,
        locale: DEFAULT_MAIL_LOCALE,
      },
    });
  }
}
