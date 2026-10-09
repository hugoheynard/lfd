import {
  type ContactSubjectPayload,
  contactSubjectPayloadSchema,
  type ContactSubjectView,
  type CreatedIdResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveContactSubjectCommand } from "../application/commands/archive-contact-subject.command.js";
import { CreateContactSubjectCommand } from "../application/commands/create-contact-subject.command.js";
import { ReviseContactSubjectCommand } from "../application/commands/revise-contact-subject.command.js";
import { ListContactSubjectsQuery } from "../application/queries/list-contact-subjects.query.js";

/**
 * Les **objets de « Nous écrire »** au back-office (E-commerce LFC › Contact),
 * sous `b2b_contact` ; l'action se déduit du verbe (`@AdminSurface`).
 */
@Controller("admin/contact/subjects")
@AdminSurface("b2b_contact")
export class AdminContactSubjectsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<ContactSubjectView[]> {
    return this.queries.execute<ListContactSubjectsQuery, ContactSubjectView[]>(
      new ListContactSubjectsQuery(),
    );
  }

  @Post()
  async create(
    @Body(new ZodBody(contactSubjectPayloadSchema)) payload: ContactSubjectPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<CreateContactSubjectCommand, string>(
      new CreateContactSubjectCommand(payload),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revise(
    @Param("id") id: string,
    @Body(new ZodBody(contactSubjectPayloadSchema)) payload: ContactSubjectPayload,
  ): Promise<void> {
    await this.commands.execute<ReviseContactSubjectCommand, void>(
      new ReviseContactSubjectCommand(id, payload),
    );
  }

  /** Archiver, jamais supprimer : un message reçu garde son objet. */
  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ArchiveContactSubjectCommand, void>(
      new ArchiveContactSubjectCommand(id),
    );
  }
}
