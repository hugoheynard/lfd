import {
  type ContactMessageStatus,
  contactMessageStatusSchema,
  type ContactMessageView,
} from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { MarkContactMessageHandledCommand } from "../application/commands/mark-contact-message-handled.command.js";
import { ListContactMessagesQuery } from "../application/queries/list-contact-messages.query.js";

/** Les **messages reçus** au back-office : à traiter / traités, « Marquer traité ». */
@Controller("admin/contact/messages")
@AdminSurface("b2b_contact")
export class AdminContactMessagesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(
    @Query("status", new ZodQuery(contactMessageStatusSchema)) status: ContactMessageStatus,
  ): Promise<ContactMessageView[]> {
    return this.queries.execute<ListContactMessagesQuery, ContactMessageView[]>(
      new ListContactMessagesQuery(status),
    );
  }

  @Post(":id/handled")
  @HttpCode(HttpStatus.NO_CONTENT)
  async markHandled(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<MarkContactMessageHandledCommand, void>(
      new MarkContactMessageHandledCommand(id, staffUserId),
    );
  }
}
