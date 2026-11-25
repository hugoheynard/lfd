import {
  type CreateEventPayload,
  createEventPayloadSchema,
  type EventCreated,
  type EventDetailView,
  type EventSummaryView,
  type ListEventsQuery as ListEventsParams,
  listEventsQuerySchema,
  type ReviseEventPayload,
  reviseEventPayloadSchema,
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
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveEventCommand } from "../application/commands/archive-event.command.js";
import { DeclareEventCommand } from "../application/commands/declare-event.command.js";
import { ReviseEventCommand } from "../application/commands/revise-event.command.js";
import { GetEventQuery } from "../application/queries/get-event.query.js";
import { ListEventsQuery } from "../application/queries/list-events.query.js";

/**
 * **Les événements** du back-office — la table, le détail, créer, renommer ou
 * déplacer, archiver (`documentation/evenements/plan-evenements.md`, E1). Sous la
 * ressource `events` : lire pour les `GET`, écrire pour le reste.
 */
@Controller("admin/events")
@AdminSurface("events")
export class AdminEventsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La table, archivés exclus, plus proche d'abord. */
  @Get()
  list(
    @Query(new ZodQuery(listEventsQuerySchema)) query: ListEventsParams,
  ): Promise<readonly EventSummaryView[]> {
    return this.queries.execute<ListEventsQuery, readonly EventSummaryView[]>(
      new ListEventsQuery(query.from ?? null, query.to ?? null),
    );
  }

  /** « Créer un événement » — une clé d'intention par geste : un double clic n'en crée qu'un. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(createEventPayloadSchema)) payload: CreateEventPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<EventCreated> {
    const id = await this.commands.execute<DeclareEventCommand, string>(
      new DeclareEventCommand(payload.name, payload.date, staffUserId, intentKey),
    );
    return { id };
  }

  /** Le détail et ses fiches en vigueur. */
  @Get(":id")
  detail(@Param("id") id: string): Promise<EventDetailView> {
    return this.queries.execute<GetEventQuery, EventDetailView>(new GetEventQuery(id));
  }

  @Patch(":id")
  @Idempotent(
    "par nature : la requête pose un nom et une date absolus ; rejouée, elle réécrit les mêmes valeurs",
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  async revise(
    @Param("id") id: string,
    @Body(new ZodBody(reviseEventPayloadSchema)) payload: ReviseEventPayload,
  ): Promise<void> {
    await this.commands.execute<ReviseEventCommand, void>(
      new ReviseEventCommand(id, payload.name ?? null, payload.date ?? null),
    );
  }

  /** Archive l'événement : il sort de la table, rien n'est effacé. */
  @Delete(":id")
  @Idempotent("par nature : un événement déjà archivé garde son premier instant d'archivage")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ArchiveEventCommand, void>(new ArchiveEventCommand(id));
  }
}
