import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { AppointmentView } from "@lfd/contracts";

import { AppointmentReader } from "../../domain/ports/appointment.reader.js";
import { ListAppointmentsQuery } from "./list-appointments.query.js";

/** La file staff des rendez-vous d'une fenêtre — tous états confondus. */
@QueryHandler(ListAppointmentsQuery)
export class ListAppointmentsHandler implements IQueryHandler<
  ListAppointmentsQuery,
  readonly AppointmentView[]
> {
  constructor(private readonly appointments: AppointmentReader) {}

  async execute(query: ListAppointmentsQuery): Promise<readonly AppointmentView[]> {
    return this.appointments.listBetween(new Date(query.from), new Date(query.to));
  }
}
