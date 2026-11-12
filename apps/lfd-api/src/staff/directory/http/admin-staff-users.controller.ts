import type { StaffInvited } from "../../invitations/invite-staff-user.handler.js";
import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  agentToolOf,
  AGENT_TOOL_HEADER,
  type CreatedStaffUserResponse,
  type StaffUserPayload,
  staffStatusChangeSchema,
  type StaffStatusChange,
  staffUserPayloadSchema,
  type StaffUserView,
  type UpdateStaffUserPayload,
  updateStaffUserPayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { AcceptedReplay } from "../../../platform/shared/http/accepted-replay.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListStaffUsersQuery } from "../application/list-staff-users.query.js";
import { SetStaffStatusCommand } from "../application/set-staff-status.command.js";
import {
  CreateStaffUserCommand,
  InviteStaffUserCommand,
  RemoveStaffUserCommand,
  UpdateStaffUserCommand,
} from "../application/staff-user.commands.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Surface **admin** (staff) de l'annuaire des users staff : lister, ajouter,
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 * l'annuaire est staff-only de bout en bout.
 */
@Controller("admin/staff-users")
@AdminSurface("staff_access")
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
    @StaffUserId() actorId: string,
    @IntentKey() intentKey: string,
  ): Promise<CreatedStaffUserResponse> {
    const id = await this.commands.execute<CreateStaffUserCommand, string>(
      new CreateStaffUserCommand(payload, actorId, intentKey),
    );
    return { id };
  }

  /**
   * Édite la fiche entière. `expectedUpdatedAt` (facultatif) refuse (409) une
   * fiche écrite depuis la lecture ; l'en-tête `x-lfd-agent-tool` est lu sans
   * être cru — il ne décide de rien, il est rangé dans les faits du journal
   * (plan `plan-outils-agent-droits.md`).
   */
  @Patch(":id")
  @Idempotent(
    "pose la fiche : rejouée, aucun champ ne change, aucun fait ne part, et l'adresse n'est propagée au fournisseur que si elle change",
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(updateStaffUserPayloadSchema)) payload: UpdateStaffUserPayload,
    @StaffUserId() actorId: string,
    @Headers(AGENT_TOOL_HEADER) agentTool: string | undefined,
  ): Promise<void> {
    await this.commands.execute<UpdateStaffUserCommand, void>(
      new UpdateStaffUserCommand(id, payload, actorId, agentToolOf(agentTool)),
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
    @StaffUserId() actorId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<SetStaffStatusCommand, void>(
      new SetStaffStatusCommand(id, change, actorId, intentKey),
    );
  }

  /**
   * Inviter, ou **renvoyer** un lien : un seul geste, un seul endpoint. Le
   * serveur sait déjà lequel des deux s'applique ; faire choisir l'écran
   * l'exposerait à se tromper dès qu'un second onglet est ouvert.
   *
   * `POST` et non `PATCH` : ce n'est pas la fiche qu'on modifie, c'est un lien
   * qu'on **émet**. Idempotent par INTENTION seulement (revue, cas 4) : un
   * double clic de même clé ne frappe qu'un ticket ; « Renvoyer » fabrique une
   * clé neuve, donc un ticket neuf qui tue le précédent — ce qu'on veut quand
   * une boîte partagée a vu passer le lien.
   *
   * Le verbe suffit à exiger `staff:write` (surface réflexive) : inviter
   * quelqu'un dans le back-office est un geste d'administrateur.
   */
  // 200 et non 204 : la réponse porte `mailSent`. Le 204 d'avant ne pouvait
  // rien dire, et l'écran annonçait donc un envoi qu'il n'avait pas constaté.
  @Post(":id/invitation")
  @AcceptedReplay(
    "OncePerIntent.run : l'écriture (markInvited et son fait) vit dans OpenStaffAccess, entre la demande d'un lien au fournisseur d'identité et l'e-mail, et le résultat gardé (mailSent) n'est connu qu'après l'e-mail, hors transaction — sceller dans l'écriture rangerait un résultat pas encore connu. Une panne entre l'écriture et la résolution de l'intention, puis un rejeu après le bail, refait le geste : un second lien, une seconde trace (l'accès, idempotent sur l'adresse, ne double pas ; l'e-mail porte la clé de l'intention)",
    "même risque que l'invitation d'un membre client, décidé par Hugo le 2026-11-12 ; inscrit le 2026-11-12",
  )
  @HttpCode(HttpStatus.OK)
  invite(
    @Param("id") id: string,
    @StaffUserId() actorId: string,
    @IntentKey() intentKey: string,
  ): Promise<StaffInvited> {
    return this.commands.execute<InviteStaffUserCommand, StaffInvited>(
      new InviteStaffUserCommand(id, actorId, intentKey),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "la suppression d'un membre est retirée : le handler refuse toujours, sans rien écrire",
  )
  async remove(@Param("id") id: string, @StaffUserId() actorId: string): Promise<void> {
    await this.commands.execute<RemoveStaffUserCommand, void>(
      new RemoveStaffUserCommand(id, actorId),
    );
  }
}
