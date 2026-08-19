import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { Appointment } from "../../domain/entities/appointment.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { parseStartAt } from "../appointment-booking.js";
import { ScheduleAppointmentCommand } from "./schedule-appointment.command.js";

/**
 * Pose d'un rendez-vous par le staff : il vient d'avoir le prospect au
 * téléphone, donc le rendez-vous naît `confirmed`.
 *
 * Deux différences assumées avec la réservation client : le staff **n'est pas
 * soumis** au délai de prévenance ni aux plages déclarées (c'est son agenda, il
 * le remplit comme il veut), mais il **reste soumis** à l'exclusivité du créneau
 * — on ne met pas deux personnes à la même heure.
 */
@CommandHandler(ScheduleAppointmentCommand)
export class ScheduleAppointmentHandler implements ICommandHandler<
  ScheduleAppointmentCommand,
  string
> {
  constructor(
    private readonly availability: AvailabilityStore,
    private readonly appointments: AppointmentRepository,
    private readonly recorder: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(command: ScheduleAppointmentCommand): Promise<string> {
    const { payload } = command;
    const now = this.clock.now();
    const startAt = parseStartAt(payload.startAt);
    const config = await this.availability.load();
    const appointment = Appointment.schedule(
      {
        startAt,
        durationMinutes: config.policy.slotMinutes,
        channel: payload.channel,
        purpose: payload.purpose,
        subjectType: payload.subjectType,
        subjectId: payload.subjectId,
        contactName: payload.contactName,
        contactEmail: payload.contactEmail,
        contactPhone: payload.contactPhone,
        message: payload.message,
        rescheduledFromId: null,
      },
      now,
    );
    const id = await this.appointments.create(appointment);
    await this.recorder.record({
      type: ACTIVITY_TYPES.appointmentConfirmed,
      subjectType: payload.subjectType === "lead" ? "lead" : payload.subjectType,
      subjectId: payload.subjectId,
      idempotencyKey: `${ACTIVITY_TYPES.appointmentConfirmed}:${id}`,
      payload: { appointmentId: id, startAt: startAt.toISOString(), via: "staff" },
    });
    return id;
  }
}
