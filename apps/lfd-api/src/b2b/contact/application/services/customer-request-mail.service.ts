import { isValidReplyTo } from "@lfd/mailer";
import { Injectable, Logger } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import type { CustomerRequestReceivedEvent } from "../../domain/customer-request.events.js";
import { presentationOf } from "../handlers/request-mail-details.js";

/** Comment le courriel dit d'où la demande a été écrite. */
const ORIGIN_LABELS = { b2b: "Espace pro", b2c: "Particulier" } as const;

/**
 * Le courriel `staff.customer-request` à l'adresse du motif, **demandé au bloc
 * `mail`** dans la transaction qui range la demande (lot S2c du plan
 * `documentation/editeur-de-contenu/plan-service-e-mails.md`).
 *
 * **`Reply-To` = l'auteur** : répondre au courriel lui écrit directement —
 * sauf si l'adresse ne passe pas `isValidReplyTo` : le courriel est alors
 * demandé sans, plutôt que pas du tout (le mailer refuserait l'envoi entier).
 * Un signalement porte le numéro de la commande et le nombre de photos ; les
 * photos restent au back-office.
 *
 * C'était un abonné en mémoire de `CustomerRequestReceivedEvent`, qui envoyait
 * en fond. Un abonné en mémoire qui appelle la porte d'un autre bloc traverse
 * la frontière (`lint:durable-cross-block`), et un redémarrage perdait le
 * courriel : il suit la forme de S2b (`SupportRequestedMail`).
 *
 * @throws l'erreur de la porte si la demande d'e-mail échoue : la demande du
 *   client est annulée avec elle, et la personne peut réessayer.
 */
@Injectable()
export class CustomerRequestMail {
  private readonly logger = new Logger(CustomerRequestMail.name);

  constructor(private readonly mail: Mail) {}

  /** À appeler DANS l'unité de travail qui range la demande. */
  async request(event: CustomerRequestReceivedEvent): Promise<void> {
    const request = event.request.toPersistence();
    const replyable = isValidReplyTo(request.author.email);
    if (!replyable) {
      this.logger.warn(
        `Courriel de demande sans Reply-To (${request.id}) : adresse refusée en en-tête.`,
      );
    }
    await this.mail.send({
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
  }
}

/** Les identifiants d'un client connecté, pour le retrouver au back-office. Vide pour un visiteur. */
function clientLabelOf(companyId: string | null, userId: string | null): string {
  if (companyId !== null) {
    return `société ${companyId}`;
  }
  return userId === null ? "" : `compte ${userId}`;
}
