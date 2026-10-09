import {
  type CreatedIdResponse,
  requestKindQuerySchema,
  type RequestKind,
  type RequestReasonPayload,
  requestReasonPayloadSchema,
  type RequestReasonView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveRequestReasonCommand } from "../application/commands/archive-request-reason.command.js";
import { CreateRequestReasonCommand } from "../application/commands/create-request-reason.command.js";
import { ReviseRequestReasonCommand } from "../application/commands/revise-request-reason.command.js";
import { ListRequestReasonsQuery } from "../application/queries/list-request-reasons.query.js";

/**
 * Les **motifs des demandes** au back-office (Réglages › Motifs des demandes,
 * un onglet par `kind`), sous `b2b_contact` ; l'action se déduit du verbe.
 */
@Controller("admin/request-reasons")
@AdminSurface("b2b_contact")
export class AdminRequestReasonsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(
    @Query("kind", new ZodQuery(requestKindQuerySchema)) kind: RequestKind,
  ): Promise<RequestReasonView[]> {
    return this.queries.execute<ListRequestReasonsQuery, RequestReasonView[]>(
      new ListRequestReasonsQuery(kind),
    );
  }

  @Post()
  async create(
    @Body(new ZodBody(requestReasonPayloadSchema)) payload: RequestReasonPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<CreateRequestReasonCommand, string>(
      new CreateRequestReasonCommand(payload),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revise(
    @Param("id") id: string,
    @Body(new ZodBody(requestReasonPayloadSchema)) payload: RequestReasonPayload,
  ): Promise<void> {
    await this.commands.execute<ReviseRequestReasonCommand, void>(
      new ReviseRequestReasonCommand(id, payload),
    );
  }

  /** Archiver, jamais supprimer : une demande reçue garde son motif. */
  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ArchiveRequestReasonCommand, void>(
      new ArchiveRequestReasonCommand(id),
    );
  }
}
