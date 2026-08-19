import {
  bookAppointmentPayloadSchema,
  type AppointmentView,
  type BookAppointmentPayload,
  type CreatedAppointmentResponse,
  type SlotsView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { BookAppointmentCommand } from "../application/commands/book-appointment.command.js";
import { CancelOwnAppointmentCommand } from "../application/commands/cancel-own-appointment.command.js";
import { GetSlotsQuery } from "../application/queries/get-slots.query.js";
import { ListMyAppointmentsQuery } from "../application/queries/list-my-appointments.query.js";

/**
 * Surface **client** de la prise de rendez-vous : voir les créneaux, réserver,
 * consulter et annuler les siens.
 *
 * Pas de `companyId` dans l'URL, contrairement au support d'activation : un
 * rendez-vous n'est **pas muré par la société** (un prospect sans société doit
 * pouvoir être reçu). Le mur s'applique quand même quand le client en désigne
 * une — c'est le handler qui vérifie l'appartenance, à partir des rattachements
 * du `Principal`.
 */
@Controller("appointments")
export class AppointmentsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les créneaux réservables entre deux jours locaux (`AAAA-MM-JJ`). */
  @Get("slots")
  slots(@Query("from") from: string, @Query("to") to: string): Promise<SlotsView> {
    return this.queries.execute<GetSlotsQuery, SlotsView>(new GetSlotsQuery(from, to));
  }

  /** Les rendez-vous à venir du demandeur (les siens et ceux de ses sociétés). */
  @Get("mine")
  mine(@CurrentUser() user: Principal): Promise<readonly AppointmentView[]> {
    return this.queries.execute<ListMyAppointmentsQuery, readonly AppointmentView[]>(
      new ListMyAppointmentsQuery(user.userId, companyIdsOf(user)),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async book(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(bookAppointmentPayloadSchema)) payload: BookAppointmentPayload,
  ): Promise<CreatedAppointmentResponse> {
    const id = await this.commands.execute<BookAppointmentCommand, string>(
      new BookAppointmentCommand(user.userId, user.email, companyIdsOf(user), payload),
    );
    return { id };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@CurrentUser() user: Principal, @Param("id") id: string): Promise<void> {
    await this.commands.execute<CancelOwnAppointmentCommand, void>(
      new CancelOwnAppointmentCommand(id, user.userId, companyIdsOf(user)),
    );
  }
}

/** Les sociétés auxquelles la personne est rattachée — le mur, relu par requête. */
function companyIdsOf(user: Principal): readonly string[] {
  return user.memberships.map((m) => m.companyId);
}
