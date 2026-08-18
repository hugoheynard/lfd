import type { StaffInvited } from "../application/invite-staff-user.handler.js";
import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import {
  type CreatedStaffUserResponse,
  type StaffUserPayload,
  staffStatusChangeSchema,
  type StaffStatusChange,
  staffUserPayloadSchema,
  type StaffUserView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { ListStaffUsersQuery } from "../application/list-staff-users.query.js";
import { SetStaffStatusCommand } from "../application/set-staff-status.command.js";
import {
  CreateStaffUserCommand,
  InviteStaffUserCommand,
  RemoveStaffUserCommand,
  UpdateStaffUserCommand,
} from "../application/staff-user.commands.js";

/**
 * Surface **admin** (staff) de l'annuaire des users staff : lister, ajouter,
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 * l'annuaire est staff-only de bout en bout.
 */
@Controller("admin/staff-users")
@AdminSurface("staff")
export class AdminStaffUsersController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<readonly StaffUserView[]> {
    return this.queries.execute<ListStaffUsersQuery, readonly StaffUserView[]>(
      new ListStaffUsersQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(staffUserPayloadSchema)) payload: StaffUserPayload,
    @StaffSub() actorSub: string,
  ): Promise<CreatedStaffUserResponse> {
    const id = await this.commands.execute<CreateStaffUserCommand, string>(
      new CreateStaffUserCommand(payload, actorSub),
    );
    return { id };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(staffUserPayloadSchema)) payload: StaffUserPayload,
    @StaffSub() actorSub: string,
  ): Promise<void> {
    await this.commands.execute<UpdateStaffUserCommand, void>(
      new UpdateStaffUserCommand(id, payload, actorSub),
    );
  }

  /**
   * Suspendre ou réintégrer. Geste distinct de l'édition d'identité : on ne
   * ferme pas un accès en enregistrant un formulaire de coordonnées.
   */
  @Patch(":id/status")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setStatus(
    @Param("id") id: string,
    @Body(new ZodBody(staffStatusChangeSchema)) change: StaffStatusChange,
    @StaffSub() actorSub: string,
  ): Promise<void> {
    await this.commands.execute<SetStaffStatusCommand, void>(
      new SetStaffStatusCommand(id, change, actorSub),
    );
  }

  /**
   * Inviter, ou **renvoyer** un lien : un seul geste, un seul endpoint. Le
   * serveur sait déjà lequel des deux s'applique ; faire choisir l'écran
   * l'exposerait à se tromper dès qu'un second onglet est ouvert.
   *
   * `POST` et non `PATCH` : ce n'est pas la fiche qu'on modifie, c'est un lien
   * qu'on **émet**. Volontairement non idempotent — chaque appel frappe un
   * ticket neuf et tue le précédent, ce qui est exactement ce qu'on veut quand
   * une boîte partagée a vu passer le lien.
   *
   * Le verbe suffit à exiger `staff:write` (surface réflexive) : inviter
   * quelqu'un dans le back-office est un geste d'administrateur.
   */
  // 200 et non 204 : la réponse porte `mailSent`. Le 204 d'avant ne pouvait
  // rien dire, et l'écran annonçait donc un envoi qu'il n'avait pas constaté.
  @Post(":id/invitation")
  @HttpCode(HttpStatus.OK)
  invite(@Param("id") id: string, @StaffSub() actorSub: string): Promise<StaffInvited> {
    return this.commands.execute<InviteStaffUserCommand, StaffInvited>(
      new InviteStaffUserCommand(id, actorSub),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @StaffSub() actorSub: string): Promise<void> {
    await this.commands.execute<RemoveStaffUserCommand, void>(
      new RemoveStaffUserCommand(id, actorSub),
    );
  }
}
