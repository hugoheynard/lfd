import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { Appointment } from "../../domain/entities/appointment.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { parseStartAt } from "../appointment-booking.js";
import { ScheduleAppointmentCommand } from "./schedule-appointment.command.js";
import { appointmentSubjectLabel } from "../appointment-subject-label.js";
import { CompanyNamer } from "../../domain/ports/company-namer.js";
import { LeadRepository } from "../../domain/ports/lead.repository.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "growth.schedule-appointment";

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
    private readonly companies: CompanyNamer,
    private readonly leads: LeadRepository,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est scellée avec
   * l'écriture ; un double clic rend le rendez-vous déjà posé sans en poser un second.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour un autre geste.
   */
  execute(command: ScheduleAppointmentCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject(command.payload.subjectId, command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.schedule(command, seal),
    );
  }

  private async schedule(
    command: ScheduleAppointmentCommand,
    seal: (appointmentId: string) => Promise<void>,
  ): Promise<string> {
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
    return this.uow.run(async () => {
      const id = await this.appointments.create(appointment);
      await this.record(appointment, payload, id, startAt);
      await seal(id);
      return id;
    });
  }

  private async record(
    appointment: Appointment,
    payload: ScheduleAppointmentCommand["payload"],
    id: string,
    startAt: Date,
  ): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.appointmentConfirmed,
      subjectType: payload.subjectType === "lead" ? "lead" : payload.subjectType,
      subjectId: payload.subjectId,
      idempotencyKey: `${ACTIVITY_TYPES.appointmentConfirmed}:${id}`,
      payload: {
        ...(await appointmentSubjectLabel(appointment, {
          companies: this.companies,
          leads: this.leads,
        })),
        appointmentId: id,
        startAt: startAt.toISOString(),
        via: "staff",
      },
    });
  }
}
