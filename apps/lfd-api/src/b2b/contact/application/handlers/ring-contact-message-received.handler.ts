import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { staffPermission } from "@lfd/contracts";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { ContactMessageReceivedEvent } from "../../domain/contact-message.events.js";

/**
 * La page des messages au back-office (E-commerce LFC › Contact › Messages),
 * route `b2b/contact/messages` de `lfd-backoffice-frontend` (vérifié le
 * 2026-10-09 dans `b2b.routes.ts`) : la cloche y mène.
 */
export const CONTACT_MESSAGES_LINK = "/b2b/contact/messages";

/**
 * **La cloche « Nous écrire »** (`nous-contacter.md`, §5.5 ; le cas
 * « demandes de contact (J2) » que `staff.prisma` annonçait). Adressée par
 * droit, à qui lit `b2b_contact` : ceux qui traitent les messages. Ni le nom
 * de l'auteur ni son texte : la cloche annonce, l'écran explique — et une
 * notification ne s'anonymise pas.
 */
@EventsHandler(ContactMessageReceivedEvent)
export class RingContactMessageReceived implements IEventHandler<ContactMessageReceivedEvent> {
  private readonly logger = new Logger(RingContactMessageReceived.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: ContactMessageReceivedEvent): void {
    void this.work.track(this.run(event), "ring-contact-message-received");
  }

  private async run(event: ContactMessageReceivedEvent): Promise<void> {
    const message = event.message.toPersistence();
    try {
      await this.notifier.notify([
        {
          kind: "contact.message_received",
          subject: `Nous écrire — ${message.subjectLabel}`,
          body: "Un message est arrivé. Le lire, répondre par courriel, puis le marquer traité.",
          link: CONTACT_MESSAGES_LINK,
          idempotencyKey: `notification:contact.message_received:${message.id}`,
          occurredAt: message.receivedAt,
          audience: staffPermission("b2b_contact", "read"),
        },
      ]);
    } catch (error) {
      this.logger.error(`Cloche « Nous écrire » non émise (${message.id})`, error);
    }
  }
}
