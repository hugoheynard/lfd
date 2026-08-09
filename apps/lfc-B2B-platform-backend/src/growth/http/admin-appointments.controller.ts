import {
  appointmentTransitionPayloadSchema,
  availabilityConfigPayloadSchema,
  bookingPolicySchema,
  staffBookAppointmentPayloadSchema,
  type AppointmentTransitionPayload,
  type AppointmentView,
  type AvailabilityConfigPayload,
  type AvailabilityConfigView,
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
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { SaveAvailabilityCommand } from "../application/commands/save-availability.command.js";
import { SaveBookingPolicyCommand } from "../application/commands/save-booking-policy.command.js";
import { ScheduleAppointmentCommand } from "../application/commands/schedule-appointment.command.js";
import { TransitionAppointmentCommand } from "../application/commands/transition-appointment.command.js";
import { GetAvailabilityQuery } from "../application/queries/get-availability.query.js";
import { GetSlotsQuery } from "../application/queries/get-slots.query.js";
import { ListAppointmentsQuery } from "../application/queries/list-appointments.query.js";

/**
 * Surface **staff** de la prise de rendez-vous : déclarer ses disponibilités,
 * prévisualiser les créneaux qu'elles ouvrent, lire la file, poser un
 * rendez-vous soi-même et le faire avancer.
 *
 * Même montage à deux surfaces que les autres `/admin/*` (`@Public()` désarme le
 * guard client global, `AdminAuthGuard` réarme la porte staff).
 */
@Controller("admin")
@Public()
@UseGuards(AdminAuthGuard)
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
   * L'**aperçu** des créneaux ouverts — la même query que le client. C'est ce qui
   * garantit que le commercial voit exactement ce qu'il vient d'ouvrir.
   */
  @Get("availability/slots")
  slots(@Query("from") from: string, @Query("to") to: string): Promise<SlotsView> {
    return this.queries.execute<GetSlotsQuery, SlotsView>(new GetSlotsQuery(from, to));
  }

  @Get("appointments")
  list(@Query("from") from: string, @Query("to") to: string): Promise<readonly AppointmentView[]> {
    return this.queries.execute<ListAppointmentsQuery, readonly AppointmentView[]>(
      new ListAppointmentsQuery(from, to),
    );
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
