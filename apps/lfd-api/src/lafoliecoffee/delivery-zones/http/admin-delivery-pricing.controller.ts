import {
  type DeliveryPricingPatch,
  deliveryPricingPatchSchema,
  type DeliveryPricingView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryPricingQuery } from "../application/get-delivery-pricing.query.js";
import { UpdateDeliveryPricingCommand } from "../application/update-delivery-pricing.command.js";

/**
 * Réglage **staff** global de livraison, par audience (plan
 * `documentation/promotions/plan-livraison-offerte.md`, sous-lot 0a) : le frais
 * de base et le franco dont chaque zone hérite. Sous `delivery_fee`, la
 * ressource des zones : c'est un frais, comme elles.
 *
 * `GET` rend la vue ; `PATCH` (`204`) prend `{ b2b?, b2c? }`, chacun
 * `{ fee?, freeDeliveryThresholdCents? }`, au moins une valeur ; `null` efface.
 * Un frais ou un franco invalide est un `400` nommé par le domaine.
 */
@Controller("admin/delivery-pricing")
@AdminSurface("delivery_fee")
export class AdminDeliveryPricingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<DeliveryPricingView> {
    return this.queries.execute<GetDeliveryPricingQuery, DeliveryPricingView>(
      new GetDeliveryPricingQuery(),
    );
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(deliveryPricingPatchSchema)) patch: DeliveryPricingPatch,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<UpdateDeliveryPricingCommand, void>(
      new UpdateDeliveryPricingCommand(patch, staffUserId),
    );
  }
}
