import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { Appointment } from "../../domain/entities/appointment.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import {
  bookedAround,
  ensureBookable,
  parseStartAt,
  resolveSubject,
} from "../appointment-booking.js";
import { BookAppointmentCommand } from "./book-appointment.command.js";
import { appointmentSubjectLabel } from "../appointment-subject-label.js";
import { CompanyNamer } from "../../domain/ports/company-namer.js";
import { AppointmentBookedAlert } from "../../domain/ports/appointment-booked-alert.js";

/**
 * Réservation client. Compose les trois gardes qui, ensemble, font l'exclusivité :
 * le **domaine** (pas dans le passé), la **configuration** (le créneau est ouvert,
 * hors prévenance/horizon — revalidée serveur), et la **base** (l'index unique
 * partiel tranche la course, traduit en 409 par l'adaptateur).
 *
 * Puis il **prévient l'équipe**, une fois le rendez-vous écrit et journalisé :
 * avant, un courriel pourrait annoncer un créneau que la base vient de refuser.
 */
@CommandHandler(BookAppointmentCommand)
export class BookAppointmentHandler implements ICommandHandler<BookAppointmentCommand, string> {
  private readonly logger = new Logger(BookAppointmentHandler.name);

  constructor(
    private readonly availability: AvailabilityStore,
    private readonly appointments: AppointmentRepository,
    private readonly recorder: ActivityRecorder,
    private readonly clock: Clock,
    private readonly companies: CompanyNamer,
    private readonly alert: AppointmentBookedAlert,
  ) {}

  async execute(command: BookAppointmentCommand): Promise<string> {
    const { payload } = command;
    const now = this.clock.now();
    const startAt = parseStartAt(payload.startAt);
    const config = await this.availability.load();
    ensureBookable(startAt, config, await bookedAround(this.appointments, startAt), now);

    const subject = resolveSubject(payload.companyId, command.actorUserId, command.companyIds);
    const appointment = Appointment.book(
      {
        startAt,
        durationMinutes: config.policy.slotMinutes,
        channel: payload.channel,
        purpose: payload.purpose,
        subjectType: subject.type,
        subjectId: subject.id,
        contactName: payload.contactName,
        contactEmail: command.actorEmail,
        contactPhone: payload.contactPhone,
        message: payload.message,
        rescheduledFromId: null,
      },
      now,
    );
    const id = await this.appointments.create(appointment);
    await this.recorder.record({
      type: ACTIVITY_TYPES.appointmentRequested,
      subjectType: subject.type === "company" ? "company" : "user",
      subjectId: subject.id,
      idempotencyKey: `${ACTIVITY_TYPES.appointmentRequested}:${id}`,
      payload: {
        ...(await appointmentSubjectLabel(appointment, { companies: this.companies })),
        appointmentId: id,
        startAt: startAt.toISOString(),
        channel: payload.channel,
      },
    });
    await this.warnTeam(id, appointment);
    return id;
  }

  /**
   * Best-effort, ici aussi : le port le promet, mais c'est la réservation que
   * ce handler garantit — un adaptateur qui romprait sa promesse ne doit pas
   * transformer un rendez-vous pris en erreur rendue au client.
   */
  private async warnTeam(id: string, appointment: Appointment): Promise<void> {
    try {
      await this.alert.notify(id, appointment);
    } catch (error) {
      this.logger.error(`Équipe non prévenue du rendez-vous ${id}`, error);
    }
  }
}
