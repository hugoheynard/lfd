import {
  editCommerceOperationPayloadSchema,
  prepareCommerceOperationPayloadSchema,
  rescheduleCommerceOperationPayloadSchema,
  setCommerceOperationAudiencePayloadSchema,
  setCommerceOperationSelectionPayloadSchema,
  setCommerceOperationVisibilityPayloadSchema,
  type CommerceOperationKeyResponse,
  type CommerceOperationView,
  type EditCommerceOperationPayload,
  type PrepareCommerceOperationPayload,
  type RescheduleCommerceOperationPayload,
  type SetCommerceOperationAudiencePayload,
  type SetCommerceOperationSelectionPayload,
  type SetCommerceOperationVisibilityPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveOperationCommand } from "../application/commands/archive-operation.command.js";
import { ChangeOperationAudienceCommand } from "../application/commands/change-operation-audience.command.js";
import { EditOperationCommand } from "../application/commands/edit-operation.command.js";
import { PrepareOperationCommand } from "../application/commands/prepare-operation.command.js";
import { RescheduleOperationCommand } from "../application/commands/reschedule-operation.command.js";
import { SetOperationSelectionCommand } from "../application/commands/set-operation-selection.command.js";
import { SetOperationVisibilityCommand } from "../application/commands/set-operation-visibility.command.js";
import { GetOperationQuery } from "../application/queries/get-operation.query.js";
import { ListOperationsQuery } from "../application/queries/list-operations.query.js";
import { calendarOf, scheduleOf } from "./operation-payloads.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * **Les opérations datées, écrites au commerce** — `/admin/operations`
 * (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * lot 1).
 *
 * La clé est dans l'URL : c'est l'identité, choisie par le staff, et elle ne
 * change jamais. Une section de l'écran = un `PUT`, comme au référentiel. Pas
 * de `DELETE` : on archive (D9).
 *
 * Sous `lfc_operations` (Q2, Hugo) : un droit à lui, ni `pim_catalog` ni
 * `lfc_catalog`.
 *
 * La reprise depuis le référentiel (`GET`/`POST /admin/operations/migration`)
 * est partie en X4 (`documentation/catalogue/catalogue-synchronise.md` §6) :
 * elle n'avait rien eu à reprendre.
 */
@Controller("admin/operations")
@AdminSurface("lfc_operations")
export class AdminOperationsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly CommerceOperationView[]> {
    return this.queries.execute<ListOperationsQuery, readonly CommerceOperationView[]>(
      new ListOperationsQuery(),
    );
  }

  @Get(":key")
  get(@Param("key") key: string): Promise<CommerceOperationView> {
    return this.queries.execute<GetOperationQuery, CommerceOperationView>(
      new GetOperationQuery(key),
    );
  }

  @Post()
  @Idempotent(
    "création à clé fournie : rejouée, la clé est prise et la requête est refusée (409 OperationKeyTakenError) avant toute écriture ni tout fait",
  )
  async prepare(
    @Body(new ZodBody(prepareCommerceOperationPayloadSchema)) body: PrepareCommerceOperationPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    const key = await this.commands.execute<PrepareOperationCommand, string>(
      new PrepareOperationCommand(
        {
          key: body.key,
          name: body.name,
          lede: body.lede,
          image: body.image,
          schedule: scheduleOf(body),
          audience: body.audience,
        },
        staffUserId,
      ),
    );
    return { key };
  }

  /** Nom, accroche, image — ce que l'annonce affiche. */
  @Put(":key/presentation")
  @Idempotent(
    "pose des valeurs : rejouée, la même présentation ne change rien et le handler rend avant toute écriture ni tout fait",
  )
  async edit(
    @Param("key") key: string,
    @Body(new ZodBody(editCommerceOperationPayloadSchema)) body: EditCommerceOperationPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    await this.commands.execute<EditOperationCommand, void>(
      new EditOperationCommand(key, body, staffUserId),
    );
    return { key };
  }

  /** Les cinq dates, ensemble. */
  @Put(":key/schedule")
  @Idempotent(
    "pose des valeurs : rejouée, le même calendrier ne change rien et le handler rend avant toute écriture ni tout fait",
  )
  async reschedule(
    @Param("key") key: string,
    @Body(new ZodBody(rescheduleCommerceOperationPayloadSchema))
    body: RescheduleCommerceOperationPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    await this.commands.execute<RescheduleOperationCommand, void>(
      new RescheduleOperationCommand(key, calendarOf(body), staffUserId),
    );
    return { key };
  }

  @Put(":key/audience")
  @Idempotent(
    "pose une valeur : rejouée, la même clientèle ne change rien et le handler rend avant toute écriture ni tout fait",
  )
  async changeAudience(
    @Param("key") key: string,
    @Body(new ZodBody(setCommerceOperationAudiencePayloadSchema))
    body: SetCommerceOperationAudiencePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    await this.commands.execute<ChangeOperationAudienceCommand, void>(
      new ChangeOperationAudienceCommand(key, body.audience, staffUserId),
    );
    return { key };
  }

  /** Masquer ou afficher — réversible, et distinct de l'archivage. */
  @Put(":key/visibility")
  @Idempotent(
    "pose une valeur : rejouée, l'agrégat dit que la visibilité est déjà celle-là (setHidden rend faux) et rien n'est écrit ni journalisé",
  )
  async setVisibility(
    @Param("key") key: string,
    @Body(new ZodBody(setCommerceOperationVisibilityPayloadSchema))
    body: SetCommerceOperationVisibilityPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    await this.commands.execute<SetOperationVisibilityCommand, void>(
      new SetOperationVisibilityCommand(key, body.hidden, staffUserId),
    );
    return { key };
  }

  /** La sélection ENTIÈRE, dans l'ordre du rayon. */
  @Put(":key/selection")
  @Idempotent(
    "pose des valeurs : rejouée, la même sélection dans le même ordre ne change rien et le handler rend avant toute écriture ni tout fait",
  )
  async setSelection(
    @Param("key") key: string,
    @Body(new ZodBody(setCommerceOperationSelectionPayloadSchema))
    body: SetCommerceOperationSelectionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    await this.commands.execute<SetOperationSelectionCommand, void>(
      new SetOperationSelectionCommand(key, body.skus, staffUserId),
    );
    return { key };
  }

  @Put(":key/archive")
  @Idempotent(
    "transition : rejouée sur une opération archivée, l'agrégat refuse (409 OperationArchivedError) avant toute écriture ni tout fait",
  )
  async archive(
    @Param("key") key: string,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    await this.commands.execute<ArchiveOperationCommand, void>(
      new ArchiveOperationCommand(key, staffUserId),
    );
    return { key };
  }
}
