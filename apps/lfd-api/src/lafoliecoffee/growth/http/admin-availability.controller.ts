import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  appointmentRangeQuerySchema,
  availabilityConfigPayloadSchema,
  availabilityExceptionsPayloadSchema,
  bookingPolicySchema,
  type AppointmentRangeQuery,
  type AvailabilityConfigPayload,
  type AvailabilityConfigView,
  type AvailabilityExceptionsPayload,
  type BookingPolicy,
  type SlotsView,
} from "@lfd/contracts";
import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { SaveAvailabilityExceptionsCommand } from "../application/commands/save-availability-exceptions.command.js";
import { SaveAvailabilityCommand } from "../application/commands/save-availability.command.js";
import { SaveBookingPolicyCommand } from "../application/commands/save-booking-policy.command.js";
import { GetAvailabilityQuery } from "../application/queries/get-availability.query.js";
import { GetSlotsQuery } from "../application/queries/get-slots.query.js";

/**
 * **Commercial › Réglages › Disponibilité** — déclarer quand un prospect peut
 * prendre rendez-vous (grille, politique, exceptions) et prévisualiser les
 * créneaux que ça ouvre.
 *
 * Sous `b2b_commercial_appointment` et non `b2b_appointments` (Hugo,
 * 2026-10-13 : droits granulaires) : régler l'offre de créneaux n'est pas
 * tenir la file. Aucun autre écran du back-office ne lit ces routes — le
 * calendrier et la page d'un rendez-vous ne lisent que `appointments`
 * (vérifié le 2026-10-13).
 *
 * 🔴 Geste de bascule : la ressource s'accorde à l'écran (`/admin/staff-roles`)
 * aux rôles qui réglaient la disponibilité sous `b2b_appointments`.
 */
@Controller("admin/availability")
@AdminSurface("b2b_commercial_appointment")
export class AdminAvailabilityController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  availability(): Promise<AvailabilityConfigView> {
    return this.queries.execute<GetAvailabilityQuery, AvailabilityConfigView>(
      new GetAvailabilityQuery(),
    );
  }

  /** Écriture **en bloc** : le commercial édite sa grille, puis enregistre. */
  @Put()
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
  @Put("policy")
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
  @Put("exceptions")
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
  @Get("slots")
  slots(
    @Query(new ZodQuery(appointmentRangeQuerySchema)) range: AppointmentRangeQuery,
  ): Promise<SlotsView> {
    return this.queries.execute<GetSlotsQuery, SlotsView>(new GetSlotsQuery(range.from, range.to));
  }
}
