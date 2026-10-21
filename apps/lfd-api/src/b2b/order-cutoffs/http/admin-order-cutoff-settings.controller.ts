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
 * Le **jour même** — Réglages › Commandes › Jour même (§8.3 ; sa page depuis
 * le 2026-10-21). Sous `lfc_order_settings`, comme l'heure limite.
 *
 * `GET` rend la vue ; `PATCH` (`204`) prend `{ sameDayAllowed?, resupplyCutoffTime? }` (l'heure limite du réassort pour demain, « la veille, HH:MM », lot R3a du 2026-10-21). L'interrupteur
 * de l'heure limite générale (`enabled`) est retiré le 2026-10-21
 * (`limites-de-commande/plan-une-seule-heure.md` §5) : une charge qui le porte
 * est refusée en 400.
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
