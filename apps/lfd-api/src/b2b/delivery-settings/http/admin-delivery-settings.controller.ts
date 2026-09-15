import {
  type DeliverySettingsPatch,
  deliverySettingsPatchSchema,
  type DeliverySettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { UpdateDeliverySettingsCommand } from "../application/commands/update-delivery-settings.command.js";
import { GetDeliverySettingsQuery } from "../application/queries/get-delivery-settings.query.js";

/**
 * Réglage **staff** de la livraison par clientèle (« E-commerce LFC → Réglages
 * → Livraison »). Même ressource que les zones de livraison, `b2b_settings` :
 * les deux se règlent sur la même carte, par les mêmes personnes. L'action se
 * déduit du verbe (`@AdminSurface`).
 */
@Controller("admin/delivery-settings")
@AdminSurface("b2b_settings")
export class AdminDeliverySettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<DeliverySettingsView> {
    return this.queries.execute<GetDeliverySettingsQuery, DeliverySettingsView>(
      new GetDeliverySettingsQuery(),
    );
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(deliverySettingsPatchSchema)) patch: DeliverySettingsPatch,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<UpdateDeliverySettingsCommand, void>(
      new UpdateDeliverySettingsCommand(patch, staffSub),
    );
  }
}
