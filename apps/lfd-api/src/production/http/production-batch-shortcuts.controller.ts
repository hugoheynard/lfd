import {
  type BatchShortcutsSettingsView,
  type CreateBatchShortcutPayload,
  type CreatedIdResponse,
  type UpdateBatchShortcutPayload,
  createBatchShortcutPayloadSchema,
  updateBatchShortcutPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { CreateBatchShortcutCommand } from "../application/commands/create-batch-shortcut.command.js";
import { RemoveBatchShortcutCommand } from "../application/commands/remove-batch-shortcut.command.js";
import { UpdateBatchShortcutCommand } from "../application/commands/update-batch-shortcut.command.js";
import { GetBatchShortcutsSettingsQuery } from "../application/queries/get-batch-shortcuts-settings.query.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **Réglages › Production › Raccourcis du fournil** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, S1).
 *
 * Sous `production_settings` : lire en `GET`, régler sinon. Le contrôleur ne
 * juge que la FORME ; le nom, les pièces, le plafond et le doublon sont jugés
 * par l'agrégat du produit. Il n'injecte que les bus.
 *
 * Supprimer est un `POST …/remove` et non un `DELETE` : la ligne s'archive.
 */
@Controller("admin/production/settings/shortcuts")
@AdminSurface("production_settings")
export class ProductionBatchShortcutsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les articles vendables, dans l'ordre du catalogue, et les raccourcis vivants. */
  @Get()
  settings(): Promise<BatchShortcutsSettingsView> {
    return this.queries.execute<GetBatchShortcutsSettingsQuery, BatchShortcutsSettingsView>(
      new GetBatchShortcutsSettingsQuery(),
    );
  }

  /** Ajoute un raccourci. 400 sur un nom ou des pièces invalides, 409 sur un doublon ou au plafond. */
  @Post()
  async create(
    @Body(new ZodBody(createBatchShortcutPayloadSchema)) body: CreateBatchShortcutPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<CreateBatchShortcutCommand, string>(
      new CreateBatchShortcutCommand(body.sku, body.label, body.pieces, staffUserId),
    );
    return { id };
  }

  /** Modifie le nom ou les pièces. 404 sur un raccourci inconnu ou supprimé. */
  @Put(":id")
  @HttpCode(NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(updateBatchShortcutPayloadSchema)) body: UpdateBatchShortcutPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateBatchShortcutCommand, void>(
      new UpdateBatchShortcutCommand(id, body.label, body.pieces),
    );
  }

  /** Supprime (archive) un raccourci. 404 s'il est inconnu ou déjà supprimé. */
  @Post(":id/remove")
  @HttpCode(NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveBatchShortcutCommand, void>(
      new RemoveBatchShortcutCommand(id),
    );
  }
}
