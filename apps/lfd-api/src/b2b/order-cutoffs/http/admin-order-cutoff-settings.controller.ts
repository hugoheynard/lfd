import {
  type OrderCutoffSettingsPatch,
  orderCutoffSettingsPatchSchema,
  type OrderCutoffSettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetOrderCutoffSettingsQuery } from "../application/get-order-cutoff-settings.query.js";
import { UpdateOrderCutoffSettingsCommand } from "../application/update-order-cutoff-settings.command.js";

/**
 * L'interrupteur **staff** de l'heure limite générale — Réglages › Commandes ›
 * Heure limite (`documentation/commandes/plan-reglages-commandes.md`, §8.1,
 * lot O3). Sous `lfc_order_settings`, comme la règle qu'il éteint.
 *
 * `GET` rend la vue ; `PATCH` (`204`) prend `{ enabled }`.
 */
@Controller("admin/order-cutoff-settings")
@AdminSurface("lfc_order_settings")
export class AdminOrderCutoffSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<OrderCutoffSettingsView> {
    return this.queries.execute<GetOrderCutoffSettingsQuery, OrderCutoffSettingsView>(
      new GetOrderCutoffSettingsQuery(),
    );
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(orderCutoffSettingsPatchSchema)) patch: OrderCutoffSettingsPatch,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<UpdateOrderCutoffSettingsCommand, void>(
      new UpdateOrderCutoffSettingsCommand(patch, staffUserId),
    );
  }
}
