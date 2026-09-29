import {
  type DeliveryRoutingSettingsPayload,
  deliveryRoutingSettingsPayloadSchema,
  type DeliveryRoutingSettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { SetRoutingSettingsCommand } from "../application/commands/set-routing-settings.command.js";
import { GetRoutingSettingsQuery } from "../application/queries/get-routing-settings.query.js";

/**
 * **Les réglages du calcul de tournée** — détour, vitesse, départ au plus tôt,
 * durée maximale, temps d'arrêt (`plan-preparation-de-tournee.md`, L7-C13,
 * L7-C15). Sous `delivery_settings`, comme la flotte et le départ, sur l'écran
 * « Point de départ ». Il n'injecte que les bus.
 */
@Controller("admin/livraison/calcul")
@AdminSurface("delivery_settings")
export class RoutingSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<DeliveryRoutingSettingsView> {
    return this.queries.execute<GetRoutingSettingsQuery, DeliveryRoutingSettingsView>(
      new GetRoutingSettingsQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Body(new ZodBody(deliveryRoutingSettingsPayloadSchema))
    payload: DeliveryRoutingSettingsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetRoutingSettingsCommand, void>(
      new SetRoutingSettingsCommand(payload, staffUserId),
    );
  }
}
