import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  appointmentRangeQuerySchema,
  appointmentTransitionPayloadSchema,
  staffBookAppointmentPayloadSchema,
  type AppointmentRangeQuery,
  type AppointmentTransitionPayload,
  type AppointmentView,
  type CreatedAppointmentResponse,
  type StaffBookAppointmentPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ScheduleAppointmentCommand } from "../application/commands/schedule-appointment.command.js";
import { TransitionAppointmentCommand } from "../application/commands/transition-appointment.command.js";
import { GetAppointmentQuery } from "../application/queries/get-appointment.query.js";
import { ListAppointmentsQuery } from "../application/queries/list-appointments.query.js";

/**
 * Surface **staff** de la file des rendez-vous : la lire, poser un rendez-vous
 * soi-même et le faire avancer. Le réglage de la disponibilité vit à côté,
 * sous sa propre ressource (`AdminAvailabilityController`, 2026-10-13).
 *
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin")
@AdminSurface("b2b_appointments")
export class AdminAppointmentsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get("appointments")
  list(
    @Query(new ZodQuery(appointmentRangeQuerySchema)) range: AppointmentRangeQuery,
  ): Promise<readonly AppointmentView[]> {
    return this.queries.execute<ListAppointmentsQuery, readonly AppointmentView[]>(
      new ListAppointmentsQuery(range.from, range.to),
    );
  }

  /** **Un** rendez-vous, pour sa page dédiée (lien direct, rafraîchissement). */
  @Get("appointments/:id")
  byId(@Param("id") id: string): Promise<AppointmentView> {
    return this.queries.execute<GetAppointmentQuery, AppointmentView>(new GetAppointmentQuery(id));
  }

  @Post("appointments")
  @HttpCode(HttpStatus.CREATED)
  async schedule(
    @Body(new ZodBody(staffBookAppointmentPayloadSchema)) payload: StaffBookAppointmentPayload,
  ): Promise<CreatedAppointmentResponse> {
    const id = await this.commands.execute<ScheduleAppointmentCommand, string>(
      new ScheduleAppointmentCommand(payload),
    );
    return { id };
  }

  @Patch("appointments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async transition(
    @Param("id") id: string,
    @Body(new ZodBody(appointmentTransitionPayloadSchema)) payload: AppointmentTransitionPayload,
  ): Promise<void> {
    await this.commands.execute<TransitionAppointmentCommand, void>(
      new TransitionAppointmentCommand(id, payload),
    );
  }
}
