import {
  type ProductionClosedDayPayload,
  type ProductionSettingsView,
  type ProductionTranchesPayload,
  productionClosedDayPayloadSchema,
  productionTranchesPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { AddProductionClosedDayCommand } from "../application/commands/add-production-closed-day.command.js";
import { SetProductionTranchesCommand } from "../application/commands/set-production-tranches.command.js";
import { RemoveProductionClosedDayCommand } from "../application/commands/remove-production-closed-day.command.js";
import { GetProductionSettingsQuery } from "../application/queries/get-production-settings.query.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **Production › Réglages** — l'arrêt automatique en lecture et les jours
 * fermés (plan `documentation/fournil/arret-du-plan.md`, Q6, lot A1).
 *
 * Sous `production_settings` : lire en `GET`, régler sinon. `PUT close` (le
 * mode et ses heures) est retiré le 2026-10-21 : l'arrêt suit l'heure limite
 * générale (`limites-de-commande/plan-une-seule-heure.md` §5). Le contrôleur
 * ne juge que la FORME ; la date d'un jour fermé est jugée par le domaine. Il
 * n'injecte que les bus.
 */
@Controller("admin/production/settings")
@AdminSurface("production_settings")
export class ProductionSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** L'arrêt automatique (lu de l'heure limite générale) et les jours fermés à venir. */
  @Get()
  settings(): Promise<ProductionSettingsView> {
    return this.queries.execute<GetProductionSettingsQuery, ProductionSettingsView>(
      new GetProductionSettingsQuery(),
    );
  }

  /**
   * Pose les tranches de production (plan `fournil/plan-tranches-de-production.md`,
   * T1). 400 sur une heure mal formée, un doublon ou plus de huit heures.
   */
  @Put("tranches")
  @HttpCode(NO_CONTENT)
  async setTranches(
    @Body(new ZodBody(productionTranchesPayloadSchema)) body: ProductionTranchesPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetProductionTranchesCommand, void>(
      new SetProductionTranchesCommand(body.mode, body.fixedTranches, staffUserId),
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
