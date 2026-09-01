import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  appointmentRangeQuerySchema,
  appointmentTransitionPayloadSchema,
  availabilityConfigPayloadSchema,
  availabilityExceptionsPayloadSchema,
  bookingPolicySchema,
  staffBookAppointmentPayloadSchema,
  type AppointmentRangeQuery,
  type AppointmentTransitionPayload,
  type AppointmentView,
  type AvailabilityConfigPayload,
  type AvailabilityConfigView,
  type AvailabilityExceptionsPayload,
  type BookingPolicy,
  type CreatedAppointmentResponse,
  type SlotsView,
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
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { SaveAvailabilityExceptionsCommand } from "../application/commands/save-availability-exceptions.command.js";
import { SaveAvailabilityCommand } from "../application/commands/save-availability.command.js";
import { SaveBookingPolicyCommand } from "../application/commands/save-booking-policy.command.js";
import { ScheduleAppointmentCommand } from "../application/commands/schedule-appointment.command.js";
import { TransitionAppointmentCommand } from "../application/commands/transition-appointment.command.js";
import { GetAppointmentQuery } from "../application/queries/get-appointment.query.js";
import { GetAvailabilityQuery } from "../application/queries/get-availability.query.js";
import { GetSlotsQuery } from "../application/queries/get-slots.query.js";
import { ListAppointmentsQuery } from "../application/queries/list-appointments.query.js";

/**
 * Surface **staff** de la prise de rendez-vous : déclarer ses disponibilités,
 * prévisualiser les créneaux qu'elles ouvrent, lire la file, poser un
 * rendez-vous soi-même et le faire avancer.
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

  @Get("availability")
  availability(): Promise<AvailabilityConfigView> {
    return this.queries.execute<GetAvailabilityQuery, AvailabilityConfigView>(
      new GetAvailabilityQuery(),
    );
  }

  /** Écriture **en bloc** : le commercial édite sa grille, puis enregistre. */
  @Put("availability")
  saveAvailability(
    @Body(new ZodBody(availabilityConfigPayloadSchema)) payload: AvailabilityConfigPayload,
  ): Promise<AvailabilityConfigView> {
    return this.commands.execute<SaveAvailabilityCommand, AvailabilityConfigView>(
      new SaveAvailabilityCommand(payload),
    );
  }

  /**
   * Écriture de **la seule politique**. Route distincte du bloc : l'écran des
   * règles n'a pas à renvoyer la grille pour régler une durée, et ne peut donc
   * pas l'écraser avec un état qu'il aurait chargé il y a dix minutes.
   */
  @Put("availability/policy")
  savePolicy(
    @Body(new ZodBody(bookingPolicySchema)) policy: BookingPolicy,
  ): Promise<AvailabilityConfigView> {
    return this.commands.execute<SaveBookingPolicyCommand, AvailabilityConfigView>(
      new SaveBookingPolicyCommand(policy),
    );
  }

  /**
   * Écriture des **seules exceptions**. Même raison que la politique : dater un
   * congé ne doit pas renvoyer la grille, et ne peut donc pas l'écraser.
   */
  @Put("availability/exceptions")
  saveExceptions(
    @Body(new ZodBody(availabilityExceptionsPayloadSchema)) payload: AvailabilityExceptionsPayload,
  ): Promise<AvailabilityConfigView> {
    return this.commands.execute<SaveAvailabilityExceptionsCommand, AvailabilityConfigView>(
      new SaveAvailabilityExceptionsCommand(payload.exceptions),
    );
  }

  /**
   * L'**aperçu** des créneaux ouverts — la même query que le client. C'est ce qui
   * garantit que le commercial voit exactement ce qu'il vient d'ouvrir.
   */
  @Get("availability/slots")
  slots(
    @Query(new ZodQuery(appointmentRangeQuerySchema)) range: AppointmentRangeQuery,
  ): Promise<SlotsView> {
    return this.queries.execute<GetSlotsQuery, SlotsView>(new GetSlotsQuery(range.from, range.to));
  }

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
