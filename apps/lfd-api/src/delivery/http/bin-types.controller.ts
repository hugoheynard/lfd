import {
  type BinTypePayload,
  binTypePayloadSchema,
  type BinTypesView,
  type CreatedIdResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { AddBinTypeCommand } from "../application/commands/add-bin-type.command.js";
import { ArchiveBinTypeCommand } from "../application/commands/archive-bin-type.command.js";
import { CorrectBinTypeCommand } from "../application/commands/correct-bin-type.command.js";
import { ReactivateBinTypeCommand } from "../application/commands/reactivate-bin-type.command.js";
import { ListBinTypesQuery } from "../application/queries/list-bin-types.query.js";

/**
 * **Le catalogue des bacs** — Livraison → Bacs
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4 bis, tranche A).
 *
 * Sous `delivery_settings`, comme la flotte : la lecture s'ouvre aussi à qui
 * lit les tournées, et à qui colise (ci-dessous) ; archiver et réactiver sont
 * des `POST` nommés. Il n'injecte que les bus.
 */
@Controller("admin/livraison/bacs")
@AdminSurface("delivery_settings")
export class BinTypesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Les formats de bac. 🔴 Se lisent AUSSI sous `production_packing:write`
   * depuis le 2026-10-07 (audit `documentation/livraisons/audit-2026-10-07.md`,
   * B4) : « + Nouveau bac », au poste de colisage, charge ces formats
   * (`packing-container-board.ts`, `loadTypes`), et un rôle qui colise sans
   * droit de livraison prenait 403 — « Les formats de bac n'ont pas pu être
   * lus ».
   *
   * L'ÉCRITURE et pas la lecture du colisage : le poste ne lit les formats
   * que pour déclarer un bac neuf, et ce bouton n'existe qu'avec
   * `production_packing:write` (vérifié le 2026-10-07, `editable()`). C'est la
   * porte du panneau « Bacs » (`plan-droits-par-geste.md`, 5.3), lectures
   * comprises : qui ne fait que lire le colisage — le support — reste à 403.
   * On élargit une lecture, on ne déplace aucun droit.
   */
  @Get()
  @RequireAnyPermission(
    "delivery_settings:read",
    "delivery_rounds:read",
    "production_packing:write",
  )
  list(): Promise<BinTypesView> {
    return this.queries.execute<ListBinTypesQuery, BinTypesView>(new ListBinTypesQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Body(new ZodBody(binTypePayloadSchema)) payload: BinTypePayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<AddBinTypeCommand, string>(
      new AddBinTypeCommand(payload),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async correct(
    @Param("id") id: string,
    @Body(new ZodBody(binTypePayloadSchema)) payload: BinTypePayload,
  ): Promise<void> {
    await this.commands.execute<CorrectBinTypeCommand, void>(
      new CorrectBinTypeCommand(id, payload),
    );
  }

  @Post(":id/archiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ArchiveBinTypeCommand, void>(new ArchiveBinTypeCommand(id));
  }

  @Post(":id/reactiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ReactivateBinTypeCommand, void>(new ReactivateBinTypeCommand(id));
  }
}
