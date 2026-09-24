import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  editOperationPayloadSchema,
  prepareOperationPayloadSchema,
  rescheduleOperationPayloadSchema,
  setOperationAudiencePayloadSchema,
  setOperationSelectionPayloadSchema,
  type EditOperationPayload,
  type OperationKeyResponse,
  type OperationView,
  type PrepareOperationPayload,
  type RescheduleOperationPayload,
  type SetOperationAudiencePayload,
  type SetOperationSelectionPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveOperationCommand } from "../application/archive-operation.js";
import { ChangeOperationAudienceCommand } from "../application/change-operation-audience.js";
import { EditOperationCommand } from "../application/edit-operation.js";
import { GetOperationQuery } from "../application/get-operation.js";
import { ListOperationsQuery } from "../application/list-operations.js";
import { PrepareOperationCommand } from "../application/prepare-operation.js";
import { RescheduleOperationCommand } from "../application/reschedule-operation.js";
import { SetOperationSelectionCommand } from "../application/set-operation-selection.js";

/**
 * **Les opérations datées** — `/pim/operations`.
 *
 * La clé est dans l'URL et non un identifiant technique : c'est l'identité de
 * l'opération, choisie par le staff, et elle ne change jamais. Une section de
 * l'écran de préparation = un `PUT`, comme les familles : nom et textes,
 * dates, clientèle, sélection. Pas de `DELETE` : on archive (D9).
 *
 * Surface murée par `@AdminSurface("pim_catalog")` : préparer Noël, c'est
 * choisir des articles et fixer des dates — le travail du catalogue (D1).
 */
@AdminSurface("pim_catalog")
@Controller("operations")
export class OperationController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly OperationView[]> {
    return this.queries.execute<ListOperationsQuery, readonly OperationView[]>(
      new ListOperationsQuery(),
    );
  }

  @Get(":key")
  get(@Param("key") key: string): Promise<OperationView> {
    return this.queries.execute<GetOperationQuery, OperationView>(new GetOperationQuery(key));
  }

  @Post()
  async prepare(
    @Body(new ZodBody(prepareOperationPayloadSchema)) body: PrepareOperationPayload,
  ): Promise<OperationKeyResponse> {
    const key = await this.commands.execute<PrepareOperationCommand, string>(
      new PrepareOperationCommand(body),
    );
    return { key };
  }

  /** Nom, accroche, image — ce que l'annonce affiche. */
  @Put(":key/presentation")
  async edit(
    @Param("key") key: string,
    @Body(new ZodBody(editOperationPayloadSchema)) body: EditOperationPayload,
  ): Promise<OperationKeyResponse> {
    await this.commands.execute<EditOperationCommand, void>(new EditOperationCommand(key, body));
    return { key };
  }

  /** Les cinq dates, ensemble. */
  @Put(":key/schedule")
  async reschedule(
    @Param("key") key: string,
    @Body(new ZodBody(rescheduleOperationPayloadSchema)) body: RescheduleOperationPayload,
  ): Promise<OperationKeyResponse> {
    await this.commands.execute<RescheduleOperationCommand, void>(
      new RescheduleOperationCommand(key, body),
    );
    return { key };
  }

  @Put(":key/audience")
  async changeAudience(
    @Param("key") key: string,
    @Body(new ZodBody(setOperationAudiencePayloadSchema)) body: SetOperationAudiencePayload,
  ): Promise<OperationKeyResponse> {
    await this.commands.execute<ChangeOperationAudienceCommand, void>(
      new ChangeOperationAudienceCommand(key, body.audience),
    );
    return { key };
  }

  /** La sélection ENTIÈRE, dans l'ordre du rayon. */
  @Put(":key/selection")
  async setSelection(
    @Param("key") key: string,
    @Body(new ZodBody(setOperationSelectionPayloadSchema)) body: SetOperationSelectionPayload,
  ): Promise<OperationKeyResponse> {
    await this.commands.execute<SetOperationSelectionCommand, void>(
      new SetOperationSelectionCommand(key, body.skus),
    );
    return { key };
  }

  @Put(":key/archive")
  async archive(@Param("key") key: string): Promise<OperationKeyResponse> {
    await this.commands.execute<ArchiveOperationCommand, void>(new ArchiveOperationCommand(key));
    return { key };
  }
}
