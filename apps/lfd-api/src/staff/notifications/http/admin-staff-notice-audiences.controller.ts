import {
  setStaffNoticeAudiencePayloadSchema,
  type SetStaffNoticeAudiencePayload,
  type StaffNoticeAudiencesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetStaffNoticeAudienceCommand } from "../application/commands/set-staff-notice-audience.command.js";
import { ListStaffNoticeAudiencesQuery } from "../application/queries/list-staff-notice-audiences.query.js";

/**
 * **Admin › Destinataires des avis** (lot P1c) : à quels rôles et à quels
 * membres part un avis que le système écrit à l'équipe. Sous son propre droit,
 * `staff_notice_audiences` : régler qui lit un avis d'argent n'est pas régler
 * l'annuaire.
 */
@Controller("admin/staff-notice-audiences")
@AdminSurface("staff_notice_audiences")
export class AdminStaffNoticeAudiencesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<StaffNoticeAudiencesView> {
    return this.queries.execute<ListStaffNoticeAudiencesQuery, StaffNoticeAudiencesView>(
      new ListStaffNoticeAudiencesQuery(),
    );
  }

  @Put(":template")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose l'ensemble des destinataires : rejouée, rien ne change et aucun fait n'est écrit",
  )
  async set(
    @Param("template") template: string,
    @Body(new ZodBody(setStaffNoticeAudiencePayloadSchema)) payload: SetStaffNoticeAudiencePayload,
    @StaffUserId() actorId: string,
  ): Promise<void> {
    await this.commands.execute<SetStaffNoticeAudienceCommand, void>(
      new SetStaffNoticeAudienceCommand(template, payload.roleKeys, payload.staffUserIds, actorId),
    );
  }
}
