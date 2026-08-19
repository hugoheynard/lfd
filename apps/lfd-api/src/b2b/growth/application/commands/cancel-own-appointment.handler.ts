import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import {
  AppointmentNotFoundError,
  AppointmentTransitionError,
} from "../../domain/errors/appointment-errors.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { ownsAppointment } from "../appointment-booking.js";
import { CancelOwnAppointmentCommand } from "./cancel-own-appointment.command.js";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Annulation par le **client**. Sans ce chemin, chaque changement d'avis devient
 * un e-mail à traiter à la main — c'est ce qui transforme un agenda en boîte de
 * réception.
 *
 * Deux gardes propres à ce chemin : le rendez-vous doit **lui appartenir** (404
 * non-divulguant sinon), et l'annulation reste possible **jusqu'au délai de
 * prévenance** — au-delà, il appelle, parce que le commercial a déjà organisé
 * sa journée autour.
 */
@CommandHandler(CancelOwnAppointmentCommand)
export class CancelOwnAppointmentHandler implements ICommandHandler<
  CancelOwnAppointmentCommand,
  void
> {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly availability: AvailabilityStore,
    private readonly recorder: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(command: CancelOwnAppointmentCommand): Promise<void> {
    const { appointmentId } = command;
    const appointment = await this.appointments.load(appointmentId);
    if (
      appointment === null ||
      !ownsAppointment(
        appointment.subjectType,
        appointment.subjectId,
        command.actorUserId,
        command.companyIds,
      )
    ) {
      throw new AppointmentNotFoundError(appointmentId);
    }
    const now = this.clock.now();
    const { policy } = await this.availability.load();
    if (appointment.startAt.getTime() - now.getTime() < policy.leadTimeHours * HOUR_MS) {
      throw new AppointmentTransitionError(
        appointment.status,
        "cancelled",
        "trop tard pour annuler en ligne — appelez-nous",
      );
    }
    appointment.transition("cancelled", "annulé par le client", now);
    await this.appointments.save(appointmentId, appointment);
    await this.recorder.record({
      type: ACTIVITY_TYPES.appointmentCancelled,
      subjectType: appointment.subjectType === "company" ? "company" : "user",
      subjectId: appointment.subjectId,
      idempotencyKey: `${ACTIVITY_TYPES.appointmentCancelled}:${appointmentId}`,
      payload: { appointmentId, via: "customer" },
    });
  }
}
