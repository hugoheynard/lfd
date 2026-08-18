import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import {
  type CreatedDeliveryZoneResponse,
  type DeliveryZonePayload,
  deliveryZonePayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  CreateDeliveryZoneCommand,
  RemoveDeliveryZoneCommand,
  UpdateDeliveryZoneCommand,
} from "../application/delivery-zone.commands.js";

/**
 * Gestion **staff** des zones de livraison (page Réglages → Retraits & livraisons).
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin/delivery-zones")
@AdminSurface("settings")
export class AdminDeliveryZonesController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(deliveryZonePayloadSchema)) payload: DeliveryZonePayload,
  ): Promise<CreatedDeliveryZoneResponse> {
    const id = await this.commands.execute<CreateDeliveryZoneCommand, string>(
      new CreateDeliveryZoneCommand(payload),
    );
    return { id };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(deliveryZonePayloadSchema)) payload: DeliveryZonePayload,
  ): Promise<void> {
    await this.commands.execute<UpdateDeliveryZoneCommand, void>(
      new UpdateDeliveryZoneCommand(id, payload),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveDeliveryZoneCommand, void>(new RemoveDeliveryZoneCommand(id));
  }
}
