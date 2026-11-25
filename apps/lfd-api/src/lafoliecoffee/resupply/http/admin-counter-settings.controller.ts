import {
  type CounterSettingsView,
  type CounterSettingsPayload,
  counterSettingsSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetCounterSettingsQuery } from "../application/get-counter-settings.query.js";
import { SetCounterSettingsCommand } from "../application/set-counter-settings.command.js";

/**
 * **Réglages › Comptoir** — le suivi du stock au comptoir, point par point
 * (décidé par Hugo le 2026-11-19). Sous `lfc_order_settings`, comme l'heure
 * du réassort (Réglages › Commandes) : pas de ressource propre.
 */
@Controller("admin/counter-settings")
@AdminSurface("lfc_order_settings")
export class AdminCounterSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<CounterSettingsView> {
    return this.queries.execute<GetCounterSettingsQuery, CounterSettingsView>(
      new GetCounterSettingsQuery(),
    );
  }

  @Put(":siteId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose une valeur : rejouée, elle réécrit les mêmes réglages sur la ligne du point, qui n'est jamais qu'une ; aucun fait, aucun e-mail",
  )
  async setSettings(
    @Param("siteId") siteId: string,
    @Body(new ZodBody(counterSettingsSchema)) body: CounterSettingsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetCounterSettingsCommand, void>(
      new SetCounterSettingsCommand(
        siteId,
        body.stockTracking,
        body.immediateWithoutStock,
        staffUserId,
      ),
    );
  }
}
