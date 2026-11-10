import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { staffPermission } from "@lfd/contracts";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CustomerEmailReplyReceived } from "../../domain/email-reply.events.js";
import { CUSTOMER_REQUESTS_LINK } from "./ring-customer-request-received.handler.js";

/**
 * **La cloche des réponses par e-mail** (plan `plan-reponses-par-e-mail.md`,
 * §2), adressée à qui lit `b2b_contact`, comme celle des demandes.
 *
 * Bornée : au plus une fois par heure et par expéditeur — la première réponse
 * de l'heure sonne, les suivantes attendent dans la boîte. Sans quoi un
 * échange suivi ferait sonner à chaque message. Ni le nom, ni l'adresse, ni
 * l'objet, ni le texte : une notification ne s'anonymise pas.
 */
@EventsHandler(CustomerEmailReplyReceived)
export class RingCustomerEmailReplyReceived implements IEventHandler<CustomerEmailReplyReceived> {
  private readonly logger = new Logger(RingCustomerEmailReplyReceived.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: CustomerEmailReplyReceived): void {
    if (event.earlierFromSenderWithinHour > 0) {
      return;
    }
    void this.work.track(this.run(event), "ring-customer-email-reply-received");
  }

  private async run(event: CustomerEmailReplyReceived): Promise<void> {
    const { id, receivedAt } = event.request;
    try {
      await this.notifier.notify([
        {
          kind: "customer_request.email_reply",
          subject: "Nouvelle réponse d'un client",
          body: "Un client a répondu à un e-mail. La lire dans les demandes clients, puis la marquer traitée.",
          link: CUSTOMER_REQUESTS_LINK,
          idempotencyKey: `notification:customer_request.email_reply:${id}`,
          occurredAt: receivedAt,
          audience: staffPermission("b2b_contact", "read"),
        },
      ]);
    } catch (error) {
      this.logger.error(`Cloche de réponse par e-mail non émise (${id})`, error);
    }
  }
}
