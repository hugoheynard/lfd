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
 * Réglage **staff** de la livraison par clientèle (Exploitation › Livraison ›
 * Zones de livraison). Sa propre ressource, `delivery_availability`, depuis le
 * 2026-10-10 (Hugo) : décider à qui l'on livre n'est pas fixer les frais des
 * zones (`delivery_fee`), même affichés sur la même page. L'action se déduit
 * du verbe (`@AdminSurface`).
 */
@Controller("admin/delivery-availability")
@AdminSurface("delivery_availability")
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
