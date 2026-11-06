import { Injectable, Logger } from "@nestjs/common";

import { MailRequests } from "../../../mail/channels/requests/mail-requests.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import {
  appointmentChannelLabel,
  purposeLabel,
} from "../../../mail/channels/templates/staff-mail-labels.js";
import type { Appointment } from "../domain/entities/appointment.js";
import { AppointmentBookedAlert } from "../domain/ports/appointment-booked-alert.js";

/**
 * L'heure d'un rendez-vous telle que l'équipe la lit : en heure de Paris, quel
 * que soit le fuseau du serveur. Le gabarit ne recalcule rien.
 */
const PARIS_DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Un instant mis en forme en heure de Paris (« mercredi 10 juin 2026 à 09:00 »). */
export function parisDateTime(instant: Date): string {
  return PARIS_DATE_TIME.format(instant);
}

/**
 * Le courriel `staff.appointment-booked` à la boîte de l'équipe.
 *
 * Même règle que les alertes de compte (`DispatchAlertChannels.mail`) : sans
 * boîte configurée, rien ne part et un avertissement le dit ; sans racine du
 * back-office, le lien est vide et le gabarit omet le bouton plutôt que d'en
 * rendre un qui ne mène nulle part ; une panne est journalisée, jamais
 * remontée.
 *
 * **L'e-mail se demande au bloc `mail`** (lot S2h, `plan-service-e-mails.md`) :
 * la demande s'écrit dans sa propre unité de travail, une fois le rendez-vous
 * écrit, et part après la validation, relancée par le balayeur. Pas dans une
 * transaction commune avec la réservation : le port promet le best-effort, et
 * une demande refusée y annulerait le rendez-vous.
 */
@Injectable()
export class MailAppointmentBookedAlert extends AppointmentBookedAlert {
  private readonly logger = new Logger(MailAppointmentBookedAlert.name);

  constructor(
    private readonly mails: MailRequests,
    private readonly unitOfWork: UnitOfWork,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async notify(appointmentId: string, appointment: Appointment): Promise<void> {
    const inbox = this.config.mailerConfig().staffInbox;
    if (inbox === null) {
      this.logger.warn(
        "Rendez-vous pris, mais aucune boîte d'équipe configurée (MAILER_STAFF_INBOX).",
      );
      return;
    }
    const base = this.config.adminBaseUrl();
    try {
      await this.unitOfWork.run(() => this.requestMail(inbox, base, appointmentId, appointment));
    } catch (error) {
      this.logger.error(`E-mail de rendez-vous pris non demandé (${appointmentId})`, error);
    }
  }

  private async requestMail(
    inbox: string,
    base: string | null,
    appointmentId: string,
    appointment: Appointment,
  ): Promise<void> {
    await this.mails.request({
      brand: "lfc",
      to: inbox,
      template: "staff.appointment-booked",
      data: {
        contactName: appointment.contactName,
        when: parisDateTime(appointment.startAt),
        purposeLabel: purposeLabel(appointment.purpose),
        channelLabel: appointmentChannelLabel(appointment.channel),
        message: appointment.message,
        // La page plein écran du back-office (`commercial.routes.ts`).
        appointmentUrl: base === null ? "" : `${base}/rendez-vous/${appointmentId}`,
      },
      // Un rendez-vous n'est pris qu'une fois : la clé ne demande rien de plus.
      idempotencyKey: `mail:appointment.booked:${appointmentId}`,
    });
  }
}
