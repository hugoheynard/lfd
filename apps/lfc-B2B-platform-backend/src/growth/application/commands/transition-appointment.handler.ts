import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { APPOINTMENT_TRANSITION_TYPES } from "../../domain/activity-event.js";
import { AppointmentNotFoundError } from "../../domain/errors/appointment-errors.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { TransitionAppointmentCommand } from "./transition-appointment.command.js";

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
      payload: { appointmentId, reason: appointment.cancelReason, via: "staff" },
    });
  }
}
