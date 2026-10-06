import {
  type ProductionCloseSettingsPayload,
  type ProductionClosedDayPayload,
  type ProductionSettingsView,
  productionCloseSettingsPayloadSchema,
  productionClosedDayPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { AddProductionClosedDayCommand } from "../application/commands/add-production-closed-day.command.js";
import { ChangeProductionCloseSettingsCommand } from "../application/commands/change-production-close-settings.command.js";
import { RemoveProductionClosedDayCommand } from "../application/commands/remove-production-closed-day.command.js";
import { GetProductionSettingsQuery } from "../application/queries/get-production-settings.query.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **Production › Réglages** — l'arrêt du plan et les jours fermés (plan
 * `documentation/production/arret-du-plan.md`, §2, Q5, Q6, lot A1).
 *
 * Sous `production_settings` : lire en `GET`, régler sinon. Le contrôleur ne
 * juge que la FORME ; les heures, leurs bornes, l'heure limite et la date d'un
 * jour fermé sont jugées par le domaine. Il n'injecte que les bus.
 */
@Controller("admin/production/settings")
@AdminSurface("production_settings")
export class ProductionSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Le réglage d'arrêt, l'heure limite qui le borne, et les jours fermés à venir. */
  @Get()
  settings(): Promise<ProductionSettingsView> {
    return this.queries.execute<GetProductionSettingsQuery, ProductionSettingsView>(
      new GetProductionSettingsQuery(),
    );
  }

  /** Pose le mode et ses heures. 400 sur une heure manquante ou hors bornes, 409 avant l'heure limite. */
  @Put("close")
  @HttpCode(NO_CONTENT)
  async changeClose(
    @Body(new ZodBody(productionCloseSettingsPayloadSchema)) body: ProductionCloseSettingsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ChangeProductionCloseSettingsCommand, void>(
      new ChangeProductionCloseSettingsCommand(body.mode, body.closeAt, body.alertAt, staffUserId),
    );
  }

  /** Ferme un jour. Idempotent ; 400 sur une date passée ou mal formée. */
  @Post("closed-days")
  @HttpCode(NO_CONTENT)
  async addClosedDay(
    @Body(new ZodBody(productionClosedDayPayloadSchema)) body: ProductionClosedDayPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<AddProductionClosedDayCommand, void>(
      new AddProductionClosedDayCommand(body.date, staffUserId),
    );
  }

  /** Rouvre un jour fermé. Silencieux s'il ne l'était pas. */
  @Delete("closed-days/:date")
  @HttpCode(NO_CONTENT)
  async removeClosedDay(
    @Param("date") date: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveProductionClosedDayCommand, void>(
      new RemoveProductionClosedDayCommand(date, staffUserId),
    );
  }
}
