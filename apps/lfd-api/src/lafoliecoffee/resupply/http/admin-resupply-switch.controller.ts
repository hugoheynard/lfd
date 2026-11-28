import {
  type ResupplySwitchPayload,
  type ResupplySwitchView,
  resupplySwitchSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetResupplySwitchQuery } from "../application/get-resupply-switch.query.js";
import { SetResupplySwitchCommand } from "../application/set-resupply-switch.command.js";

/**
 * **Réglages › Production › Fournil — l'interrupteur du réassort** (décidé
 * par Hugo le 2026-11-28). Le réassort en est le propriétaire ; l'écran vit
 * dans les réglages du fournil, d'où `production_settings`. La lecture est
 * ouverte au comptoir, au fournil et aux modèles, qui doivent savoir s'ils
 * montrent leurs écrans.
 */
@Controller("admin/resupply-switch")
@AdminSurface("production_settings")
export class AdminResupplySwitchController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission(
    "production_settings:read",
    "production_resupply:read",
    "handover_counter:read",
    "resupply_templates:read",
  )
  read(): Promise<ResupplySwitchView> {
    return this.queries.execute<GetResupplySwitchQuery, ResupplySwitchView>(
      new GetResupplySwitchQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose une valeur : rejouée, elle réécrit le même état sur l'unique ligne de l'interrupteur ; aucun fait, aucun e-mail",
  )
  async set(
    @Body(new ZodBody(resupplySwitchSchema)) body: ResupplySwitchPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetResupplySwitchCommand, void>(
      new SetResupplySwitchCommand(body.enabled, staffUserId),
    );
  }
}
