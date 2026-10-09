import { isValidReplyTo } from "@lfd/mailer";
import { Inject, Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { CustomerRequestReceivedEvent } from "../../domain/customer-request.events.js";
import { presentationOf } from "./request-mail-details.js";

/** Comment le courriel dit d'où la demande a été écrite. */
const ORIGIN_LABELS = { b2b: "Espace pro", b2c: "Particulier" } as const;

/**
 * Envoie une demande à l'adresse de son motif, **`Reply-To` = l'auteur** :
 * répondre au courriel lui écrit directement — sauf si l'adresse ne passe pas
 * `isValidReplyTo` : le courriel part alors sans, plutôt que pas du tout. Un
 * signalement porte le numéro de la commande et le nombre de photos ; les
 * photos restent au back-office (`customer-request-mail.ts`).
 *
 * Hors de la requête, suivi par `BackgroundWork`. Un échec d'envoi est écrit
 * dans les logs — avec l'id de la demande, jamais l'adresse — et la demande
 * reste rangée au back-office : c'est là qu'on la retrouve.
 */
@EventsHandler(CustomerRequestReceivedEvent)
export class MailCustomerRequest implements IEventHandler<CustomerRequestReceivedEvent> {
  private readonly logger = new Logger(MailCustomerRequest.name);

  constructor(
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: CustomerRequestReceivedEvent): void {
    void this.work.track(this.run(event), "mail-customer-request");
  }

  private async run(event: CustomerRequestReceivedEvent): Promise<void> {
    const request = event.request.toPersistence();
    const replyable = isValidReplyTo(request.author.email);
    if (!replyable) {
      this.logger.warn(
        `Courriel de demande sans Reply-To (${request.id}) : adresse refusée en en-tête.`,
      );
    }
    try {
      await this.mailer.send({
        to: event.recipientEmail,
        ...(replyable ? { replyTo: request.author.email } : {}),
        template: "staff.customer-request",
        idempotencyKey: `customer-request:${request.id}`,
        data: {
          requestId: request.id,
          ...presentationOf(request.details),
          reasonLabel: request.reason.labelFr,
          urgent: request.reason.priority === "urgent",
          authorName: request.author.name,
          authorEmail: request.author.email,
          authorPhone: request.author.phone,
          originLabel: ORIGIN_LABELS[request.audience],
          clientLabel: clientLabelOf(request.companyId, request.userId),
          message: request.body,
        },
      });
    } catch (error) {
      this.logger.error(
        `Courriel de demande non envoyé (${request.id}) : la demande reste rangée au back-office.`,
        error,
      );
    }
  }
}

/** Les identifiants d'un client connecté, pour le retrouver au back-office. Vide pour un visiteur. */
function clientLabelOf(companyId: string | null, userId: string | null): string {
  if (companyId !== null) {
    return `société ${companyId}`;
  }
  return userId === null ? "" : `compte ${userId}`;
}
