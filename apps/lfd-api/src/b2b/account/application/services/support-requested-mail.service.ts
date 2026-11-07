import type { SupportRequestView } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { AppConfig } from "../../../../platform/config/app-config.js";
import { purposeLabel } from "../../../../mail/channels/templates/staff-mail-labels.js";
import { SupportRequestReader } from "../../domain/ports/support-request.reader.js";

/** Le jour souhaité, en toutes lettres. Une colonne DATE : lue à midi UTC, elle ne change pas de jour. */
const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Ce que l'équipe lit sous « Disponibilité ». */
export function availabilityOf(request: SupportRequestView): string {
  if (request.channel === "email") {
    return "Par e-mail";
  }
  if (request.asap || request.scheduledDate === null) {
    return "Rappel au plus vite";
  }
  const day = DAY_LABEL.format(new Date(`${request.scheduledDate}T12:00:00.000Z`));
  if (request.slot === null) {
    return day;
  }
  return `${day}, ${request.slot === "morning" ? "le matin" : "l'après-midi"}`;
}

/**
 * Le courriel `staff.support-requested` à la boîte de l'équipe, **demandé au
 * bloc `mail`** dans la transaction qui enregistre la demande de contact
 * (lot S2b du plan `documentation/editeur-de-contenu/plan-service-e-mails.md`).
 *
 * C'était un abonné en mémoire de `SupportRequestedEvent`, qui envoyait en
 * fond. Il ne pouvait pas le rester : un abonné en mémoire qui appelle la
 * porte d'un autre bloc traverse la frontière (`lint:durable-cross-block`),
 * et un redémarrage entre le dépôt et l'envoi perdait le courriel. Il suit
 * désormais la forme d'« Avertir le client » (S2a) : la demande et l'écriture
 * tombent ensemble, l'envoi part après la validation.
 *
 * Il **relit** la demande qu'on vient d'écrire (même transaction) : le
 * courriel montre ce qui est en base.
 *
 * Sans boîte configurée, rien n'est demandé et un avertissement le dit — la
 * demande de contact, elle, s'enregistre.
 *
 * @throws l'erreur de la porte si la demande d'e-mail échoue : la demande de
 *   contact est alors annulée avec elle, et la personne peut réessayer.
 */
@Injectable()
export class SupportRequestedMail {
  private readonly logger = new Logger(SupportRequestedMail.name);

  constructor(
    private readonly requests: SupportRequestReader,
    private readonly mail: Mail,
    private readonly config: AppConfig,
  ) {}

  /** À appeler DANS l'unité de travail qui a écrit la demande de contact. */
  async request(supportRequestId: string, subjectLabel: string | null): Promise<void> {
    const inbox = this.config.mailerConfig().staffInbox;
    if (inbox === null) {
      this.logger.warn(
        "Demande de contact déposée, mais aucune boîte d'équipe configurée (MAILER_STAFF_INBOX).",
      );
      return;
    }
    const request = await this.requests.find(supportRequestId);
    if (request === null) {
      this.logger.warn(`Demande de contact ${supportRequestId} introuvable : équipe non prévenue.`);
      return;
    }
    await this.mail.send({
      to: inbox,
      template: "staff.support-requested",
      data: {
        // Le nom du sujet au moment du dépôt — la société, sinon la personne.
        contactName: subjectLabel ?? "",
        purposeLabel: purposeLabel(request.purpose),
        availability: availabilityOf(request),
        phoneNumber: request.phoneNumber,
        message: request.message,
      },
      idempotencyKey: `mail:support.requested:${supportRequestId}`,
    });
  }
}
