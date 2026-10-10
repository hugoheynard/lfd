import type { SupportRequestView } from "@lfd/contracts";
import { Inject, Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { purposeLabel } from "../../../../platform/mailer/staff-mail-labels.js";
import { SupportRequestedEvent } from "../../domain/events/support-requested.event.js";
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
 * Abonné : une demande de contact déposée → le courriel
 * `staff.support-requested` à la boîte de l'équipe.
 *
 * Il **relit** la demande plutôt que de la recevoir dans l'événement : le fait
 * reste maigre, et le courriel montre ce qui est en base.
 *
 * Même règle que les alertes de compte : sans boîte configurée, rien ne part et
 * un avertissement le dit ; une panne du fournisseur est journalisée, jamais
 * remontée — la demande est déjà enregistrée.
 */
@EventsHandler(SupportRequestedEvent)
export class MailSupportRequested implements IEventHandler<SupportRequestedEvent> {
  private readonly logger = new Logger(MailSupportRequested.name);

  constructor(
    private readonly requests: SupportRequestReader,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly config: AppConfig,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: SupportRequestedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "mail-support-requested");
  }

  private async run(event: SupportRequestedEvent): Promise<void> {
    const inbox = this.config.mailerConfig().staffInbox;
    if (inbox === null) {
      this.logger.warn(
        "Demande de contact déposée, mais aucune boîte d'équipe configurée (MAILER_STAFF_INBOX).",
      );
      return;
    }
    try {
      const request = await this.requests.find(event.supportRequestId);
      if (request === null) {
        this.logger.warn(
          `Demande de contact ${event.supportRequestId} introuvable : équipe non prévenue.`,
        );
        return;
      }
      await this.mailer.send({
        to: inbox,
        template: "staff.support-requested",
        data: {
          // Le nom du sujet au moment du fait — la société, sinon la personne.
          contactName: event.subjectLabel ?? "",
          purposeLabel: purposeLabel(request.purpose),
          availability: availabilityOf(request),
          phoneNumber: request.phoneNumber,
          message: request.message,
        },
        idempotencyKey: `mail:support.requested:${event.supportRequestId}`,
      });
    } catch (error) {
      this.logger.error(
        `E-mail de demande de contact non envoyé (${event.supportRequestId})`,
        error,
      );
    }
  }
}
