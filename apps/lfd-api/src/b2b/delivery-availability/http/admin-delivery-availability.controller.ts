import {
  type DeliveryAvailabilityPatch,
  deliveryAvailabilityPatchSchema,
  type DeliveryAvailabilityView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { UpdateDeliveryAvailabilityCommand } from "../application/commands/update-delivery-availability.command.js";
import { GetDeliveryAvailabilityQuery } from "../application/queries/get-delivery-availability.query.js";

/**
 * Réglage **staff** de la livraison par clientèle (« E-commerce LFC → Réglages
 * → Livraison »). Même ressource que les zones de livraison, `b2b_settings` :
 * les deux se règlent sur la même carte, par les mêmes personnes. L'action se
 * déduit du verbe (`@AdminSurface`).
 */
@Controller("admin/delivery-availability")
@AdminSurface("b2b_settings")
export class AdminDeliveryAvailabilityController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<DeliveryAvailabilityView> {
    return this.queries.execute<GetDeliveryAvailabilityQuery, DeliveryAvailabilityView>(
      new GetDeliveryAvailabilityQuery(),
    );
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(deliveryAvailabilityPatchSchema)) patch: DeliveryAvailabilityPatch,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<UpdateDeliveryAvailabilityCommand, void>(
      new UpdateDeliveryAvailabilityCommand(patch, staffUserId),
    );
  }
}
