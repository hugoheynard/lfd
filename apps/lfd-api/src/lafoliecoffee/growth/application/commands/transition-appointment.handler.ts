import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { APPOINTMENT_TRANSITION_TYPES } from "../../domain/activity-event.js";
import type { Appointment } from "../../domain/entities/appointment.js";
import { AppointmentNotFoundError } from "../../domain/errors/appointment-errors.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { TransitionAppointmentCommand } from "./transition-appointment.command.js";
import { appointmentSubjectLabel } from "../appointment-subject-label.js";
import { CompanyNamer } from "../../domain/ports/company-namer.js";
import { LeadRepository } from "../../domain/ports/lead.repository.js";

/**
 * Changement d'état par le staff. Charge l'agrégat (404 si absent), délègue la
 * garde au domaine (`transition`, qui refuse un état clos, une transition non
 * prévue, une annulation sans motif ou une clôture anticipée), persiste, puis
 * journalise l'événement correspondant.
 */
@CommandHandler(TransitionAppointmentCommand)
export class TransitionAppointmentHandler implements ICommandHandler<
  TransitionAppointmentCommand,
  void
> {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly recorder: ActivityRecorder,
    private readonly clock: Clock,
    private readonly companies: CompanyNamer,
    private readonly leads: LeadRepository,
  ) {}

  async execute(command: TransitionAppointmentCommand): Promise<void> {
    const { appointmentId, payload } = command;
    const appointment = await this.appointments.load(appointmentId);
    if (appointment === null) {
      throw new AppointmentNotFoundError(appointmentId);
    }
    appointment.transition(payload.status, payload.reason, this.clock.now());
    await this.appointments.save(appointmentId, appointment);

    const type = APPOINTMENT_TRANSITION_TYPES[payload.status];
    if (type === undefined) {
      return;
    }
    await this.recorder.record({
      type,
      subjectType: appointment.subjectType === "company" ? "company" : "user",
      subjectId: appointment.subjectId,
      idempotencyKey: `${type}:${appointmentId}`,
      payload: {
        ...(await appointmentSubjectLabel(appointment, {
          companies: this.companies,
          leads: this.leads,
        })),
        appointmentId,
        ...detailsOf(payload.status, appointment),
        via: "staff",
      },
    });
  }
}

/**
 * Ce que chaque transition dit de plus que le rendez-vous : l'instant pour une
 * confirmation (la même charge que la pose par le staff), le motif pour une
 * annulation. Honoré ou manqué n'ont rien à ajouter — la clé `reason` qu'ils
 * portaient recopiait un motif d'annulation vide (lot B, 2026-09-19).
 */
function detailsOf(status: string, appointment: Appointment): Record<string, unknown> {
  if (status === "confirmed") {
    return { startAt: appointment.startAt.toISOString() };
  }
  if (status === "cancelled") {
    return { reason: appointment.cancelReason };
  }
  return {};
}
