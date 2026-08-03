import {
  type CreatedStaffUserResponse,
  type StaffUserPayload,
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
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { ListStaffUsersQuery } from "../application/list-staff-users.query.js";
import {
  CreateStaffUserCommand,
  RemoveStaffUserCommand,
  UpdateStaffUserCommand,
} from "../application/staff-user.commands.js";

/**
 * Surface **admin** (staff) de l'annuaire des users staff : lister, ajouter,
 * éditer, supprimer. Montage à deux surfaces habituel (`@Public()` désarme le
 * guard client, `AdminAuthGuard` réarme la porte staff). Aucune surface publique :
 * l'annuaire est staff-only de bout en bout.
 */
@Controller("admin/staff-users")
@Public()
@UseGuards(AdminAuthGuard)
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
  ): Promise<CreatedStaffUserResponse> {
    const id = await this.commands.execute<CreateStaffUserCommand, string>(
      new CreateStaffUserCommand(payload),
    );
    return { id };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(staffUserPayloadSchema)) payload: StaffUserPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateStaffUserCommand, void>(
      new UpdateStaffUserCommand(id, payload),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveStaffUserCommand, void>(new RemoveStaffUserCommand(id));
  }
}
