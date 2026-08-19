import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { AppointmentView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { AppointmentReader } from "../../domain/ports/appointment.reader.js";
import { ListMyAppointmentsQuery } from "./list-my-appointments.query.js";

/**
 * Les rendez-vous à venir du demandeur : les siens **et** ceux de ses sociétés
 * (une personne peut avoir réservé au nom d'une société dont elle est membre).
 * Deux lectures fusionnées puis retriées — il n'y en a jamais beaucoup.
 */
@QueryHandler(ListMyAppointmentsQuery)
export class ListMyAppointmentsHandler implements IQueryHandler<
  ListMyAppointmentsQuery,
  readonly AppointmentView[]
> {
  constructor(
    private readonly appointments: AppointmentReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListMyAppointmentsQuery): Promise<readonly AppointmentView[]> {
    const now = this.clock.now();
    const [own, byCompany] = await Promise.all([
      this.appointments.listUpcomingFor("user", [query.actorUserId], now),
      this.appointments.listUpcomingFor("company", query.companyIds, now),
    ]);
    return [...own, ...byCompany].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
}
