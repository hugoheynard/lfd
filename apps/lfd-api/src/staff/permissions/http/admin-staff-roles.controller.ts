import {
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
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListStaffRolesQuery } from "../application/list-staff-roles.query.js";
import {
  ArchiveStaffRoleCommand,
  CreateStaffRoleCommand,
  RestoreStaffRoleCommand,
  UpdateStaffRoleCommand,
} from "../application/staff-role.commands.js";

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
  async update(
    @Param("key") key: string,
    @Body(new ZodBody(updateStaffRolePayloadSchema)) payload: UpdateStaffRolePayload,
  ): Promise<void> {
    await this.commands.execute<UpdateStaffRoleCommand, void>(
      new UpdateStaffRoleCommand(key, payload),
    );
  }

  @Delete(":key")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("key") key: string): Promise<void> {
    await this.commands.execute<ArchiveStaffRoleCommand, void>(new ArchiveStaffRoleCommand(key));
  }

  @Post(":key/restore")
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(@Param("key") key: string): Promise<void> {
    await this.commands.execute<RestoreStaffRoleCommand, void>(new RestoreStaffRoleCommand(key));
  }
}
