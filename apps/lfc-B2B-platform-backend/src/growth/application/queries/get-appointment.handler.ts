import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { AppointmentView } from "@lfd/contracts";

import { AppointmentNotFoundError } from "../../domain/errors/appointment-errors.js";
import { AppointmentReader } from "../../domain/ports/appointment.reader.js";
import { GetAppointmentQuery } from "./get-appointment.query.js";

/** Rend le rendez-vous, ou un 404 — la page a besoin des deux réponses. */
@QueryHandler(GetAppointmentQuery)
export class GetAppointmentHandler implements IQueryHandler<GetAppointmentQuery, AppointmentView> {
  constructor(private readonly appointments: AppointmentReader) {}

  async execute(query: GetAppointmentQuery): Promise<AppointmentView> {
    const appointment = await this.appointments.byId(query.appointmentId);
    if (appointment === null) {
      throw new AppointmentNotFoundError(query.appointmentId);
    }
    return appointment;
  }
}
