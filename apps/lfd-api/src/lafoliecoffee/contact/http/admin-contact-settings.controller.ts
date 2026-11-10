import {
  type ContactSettingsPayload,
  contactSettingsPayloadSchema,
  type ContactSettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { UpdateContactSettingsCommand } from "../application/commands/update-contact-settings.command.js";
import { GetContactSettingsQuery } from "../application/queries/get-contact-settings.query.js";

/** La **carte de contact** de la boutique au back-office, sous `b2b_contact`. */
@Controller("admin/contact/settings")
@AdminSurface("b2b_contact")
export class AdminContactSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<ContactSettingsView> {
    return this.queries.execute<GetContactSettingsQuery, ContactSettingsView>(
      new GetContactSettingsQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(contactSettingsPayloadSchema)) payload: ContactSettingsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<UpdateContactSettingsCommand, void>(
      new UpdateContactSettingsCommand(payload, staffUserId),
    );
  }
}
