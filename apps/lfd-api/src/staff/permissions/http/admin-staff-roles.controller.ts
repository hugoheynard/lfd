import {
  agentToolOf,
  AGENT_TOOL_HEADER,
  createStaffRolePayloadSchema,
  updateStaffRolePayloadSchema,
  type CreateStaffRolePayload,
  type StaffRoleView,
  type UpdateStaffRolePayload,
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
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListStaffRolesQuery } from "../application/list-staff-roles.query.js";
import {
  ArchiveStaffRoleCommand,
  CreateStaffRoleCommand,
  RestoreStaffRoleCommand,
  UpdateStaffRoleCommand,
} from "../application/staff-role.commands.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Surface **admin** des rôles : les voir, en définir, les modifier, les retirer.
 *
 * Murée par `@AdminSurface("staff_access")` — la même ressource que l'annuaire, et
 * c'est délibéré : définir un rôle et l'attribuer sont le même pouvoir vu de
 * deux côtés, et les séparer donnerait à quelqu'un le droit de fabriquer des
 * droits sans celui de les donner (ou l'inverse), ce qui n'a de sens ni pour
 * l'un ni pour l'autre.
 *
 * `DELETE` **archive**, il ne supprime pas : un rôle qu'on efface emporte la
 * réponse à « quels droits avait cette personne l'an dernier ».
 *
 * `PUT` lit l'en-tête `x-lfd-agent-tool` **sans le croire** : il ne décide de
 * rien, il range le nom de l'outil agent dans le fait du journal (plan
 * `plan-outils-agent-droits.md`).
 */
@Controller("admin/staff-roles")
@AdminSurface("staff_access")
export class AdminStaffRolesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<readonly StaffRoleView[]> {
    return this.queries.execute<ListStaffRolesQuery, readonly StaffRoleView[]>(
      new ListStaffRolesQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent(
    "la clé du rôle vient de la requête, pas d'un générateur : rejouée, la clé est prise et la création est refusée (409) sans rien écrire",
  )
  async create(
    @Body(new ZodBody(createStaffRolePayloadSchema)) payload: CreateStaffRolePayload,
  ): Promise<{ readonly key: string }> {
    const key = await this.commands.execute<CreateStaffRoleCommand, string>(
      new CreateStaffRoleCommand(payload),
    );
    return { key };
  }

  @Put(":key")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("pose la définition du rôle : rejouée, rien ne change et aucun fait n'est écrit")
  async update(
    @Param("key") key: string,
    @Body(new ZodBody(updateStaffRolePayloadSchema)) payload: UpdateStaffRolePayload,
    @StaffUserId() actorId: string,
    @Headers(AGENT_TOOL_HEADER) agentTool: string | undefined,
  ): Promise<void> {
    await this.commands.execute<UpdateStaffRoleCommand, void>(
      new UpdateStaffRoleCommand(key, payload, actorId, agentToolOf(agentTool)),
    );
  }

  @Delete(":key")
  @Idempotent(
    "pose l'état archivé : rejouée sur un rôle archivé, sa date reste la première, ni écriture ni fait",
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("key") key: string): Promise<void> {
    await this.commands.execute<ArchiveStaffRoleCommand, void>(new ArchiveStaffRoleCommand(key));
  }

  @Post(":key/restore")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "remet `archivedAt` à vide : rejouée, le rôle est déjà en circulation et aucun fait n'est écrit",
  )
  async restore(@Param("key") key: string): Promise<void> {
    await this.commands.execute<RestoreStaffRoleCommand, void>(new RestoreStaffRoleCommand(key));
  }
}
