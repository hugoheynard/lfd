import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { staffPermission } from "@lfd/contracts";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CustomerRequestReceivedEvent } from "../../domain/customer-request.events.js";
import { presentationOf } from "./request-mail-details.js";

/**
 * La boîte « Demandes clients » au back-office, route `/b2b/demandes` de
 * `lfd-backoffice-frontend` (`demandes-clients.md`, §6.8 ; route à
 * bâtir par le lot front — non vérifiée dans `b2b.routes.ts` le 2026-10-09).
 * La cloche y mène.
 */
export const CUSTOMER_REQUESTS_LINK = "/b2b/demandes";

/**
 * **La cloche des demandes clients**, adressée par droit à qui lit
 * `b2b_contact` : ceux qui traitent les demandes. Ni le nom de l'auteur ni
 * son texte : la cloche annonce, l'écran explique — et une notification ne
 * s'anonymise pas.
 */
@EventsHandler(CustomerRequestReceivedEvent)
export class RingCustomerRequestReceived implements IEventHandler<CustomerRequestReceivedEvent> {
  private readonly logger = new Logger(RingCustomerRequestReceived.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: CustomerRequestReceivedEvent): void {
    void this.work.track(this.run(event), "ring-customer-request-received");
  }

  private async run(event: CustomerRequestReceivedEvent): Promise<void> {
    const request = event.request.toPersistence();
    const { formLabel } = presentationOf(request.details);
    try {
      await this.notifier.notify([
        {
          kind: "customer_request.received",
          subject: `${formLabel} — ${request.reason.labelFr}`,
          body: "Une demande est arrivée. La lire, répondre par courriel, puis la marquer traitée.",
          link: CUSTOMER_REQUESTS_LINK,
          idempotencyKey: `notification:customer_request.received:${request.id}`,
          occurredAt: request.receivedAt,
          audience: staffPermission("b2b_contact", "read"),
        },
      ]);
    } catch (error) {
      this.logger.error(`Cloche de demande non émise (${request.id})`, error);
    }
  }
}
