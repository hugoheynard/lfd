import {
  editCommerceOperationPayloadSchema,
  prepareCommerceOperationPayloadSchema,
  rescheduleCommerceOperationPayloadSchema,
  setCommerceOperationAudiencePayloadSchema,
  setCommerceOperationSelectionPayloadSchema,
  setCommerceOperationVisibilityPayloadSchema,
  type CommerceOperationKeyResponse,
  type EditCommerceOperationPayload,
  type PrepareCommerceOperationPayload,
  type RescheduleCommerceOperationPayload,
  type SetCommerceOperationAudiencePayload,
  type SetCommerceOperationSelectionPayload,
  type SetCommerceOperationVisibilityPayload,
} from "@lfd/contracts";
import { Body, Controller, Param, Post, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

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
import { scheduleOf } from "./operation-payloads.js";

/**
 * **Les opérations datées, écrites au commerce** — `/admin/operations`
 * (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * lot 1).
 *
 * 🔴 **FERMÉES** tant que `OPERATIONS_AT_COMMERCE` l'est : chaque geste répond
 * 409 `operations.writing_closed`, avant toute lecture. Le push écrit encore
 * les opérations, et il écraserait ce que ces routes écriraient ; elles
 * s'ouvrent avec la bascule (lot 3), qui l'arrête d'abord.
 *
 * La clé est dans l'URL : c'est l'identité, choisie par le staff, et elle ne
 * change jamais. Une section de l'écran = un `PUT`, comme au référentiel. Pas
 * de `DELETE` : on archive (D9).
 *
 * Sous `lfc_operations` (Q2, Hugo) : un droit à lui, ni `pim_catalog` ni
 * `b2b_catalog`.
 */
@Controller("admin/operations")
@AdminSurface("lfc_operations")
export class AdminOperationsController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
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
  async reschedule(
    @Param("key") key: string,
    @Body(new ZodBody(rescheduleCommerceOperationPayloadSchema))
    body: RescheduleCommerceOperationPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CommerceOperationKeyResponse> {
    await this.commands.execute<RescheduleOperationCommand, void>(
      new RescheduleOperationCommand(key, scheduleOf(body), staffUserId),
    );
    return { key };
  }

  @Put(":key/audience")
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
