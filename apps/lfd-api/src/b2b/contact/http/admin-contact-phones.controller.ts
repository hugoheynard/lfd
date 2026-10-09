import {
  type ContactPhonePayload,
  contactPhonePayloadSchema,
  type ContactPhoneView,
  type CreatedIdResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveContactPhoneCommand } from "../application/commands/archive-contact-phone.command.js";
import { CreateContactPhoneCommand } from "../application/commands/create-contact-phone.command.js";
import { ReviseContactPhoneCommand } from "../application/commands/revise-contact-phone.command.js";
import { ListContactPhonesQuery } from "../application/queries/list-contact-phones.query.js";

/** Les **numéros de contact** de la boutique au back-office, sous `b2b_contact`. */
@Controller("admin/contact/phones")
@AdminSurface("b2b_contact")
export class AdminContactPhonesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<ContactPhoneView[]> {
    return this.queries.execute<ListContactPhonesQuery, ContactPhoneView[]>(
      new ListContactPhonesQuery(),
    );
  }

  @Post()
  async create(
    @Body(new ZodBody(contactPhonePayloadSchema)) payload: ContactPhonePayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<CreateContactPhoneCommand, string>(
      new CreateContactPhoneCommand(payload),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revise(
    @Param("id") id: string,
    @Body(new ZodBody(contactPhonePayloadSchema)) payload: ContactPhonePayload,
  ): Promise<void> {
    await this.commands.execute<ReviseContactPhoneCommand, void>(
      new ReviseContactPhoneCommand(id, payload),
    );
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ArchiveContactPhoneCommand, void>(
      new ArchiveContactPhoneCommand(id),
    );
  }
}
