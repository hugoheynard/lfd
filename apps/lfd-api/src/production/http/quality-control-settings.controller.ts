import {
  type QualityControlSettingsPayload,
  qualityControlSettingsPayloadSchema,
  type QualityControlSettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { SetQualityControlSettingsCommand } from "../application/commands/set-quality-control-settings.command.js";
import { GetQualityControlSettingsQuery } from "../application/queries/get-quality-control-settings.query.js";

/**
 * **Réglages › Commandes › Contrôle qualité** (décision de Hugo, 2026-10-26).
 * Sous `lfc_order_settings`, le droit des réglages de commande voisins (heure
 * limite, jour même, relances) : où l'on juge une commande se règle avec
 * le reste de sa vie. Aucun droit neuf.
 *
 * La Supervision ne lit pas cette route : les deux interrupteurs voyagent dans
 * ses pastilles. N'injecte que les bus.
 */
@Controller("admin/production/quality-settings")
@AdminSurface("lfc_order_settings")
export class QualityControlSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<QualityControlSettingsView> {
    return this.queries.execute<GetQualityControlSettingsQuery, QualityControlSettingsView>(
      new GetQualityControlSettingsQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Body(new ZodBody(qualityControlSettingsPayloadSchema)) payload: QualityControlSettingsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetQualityControlSettingsCommand, void>(
      new SetQualityControlSettingsCommand(payload.lineChecks, payload.orderChecks, staffUserId),
    );
  }
}
