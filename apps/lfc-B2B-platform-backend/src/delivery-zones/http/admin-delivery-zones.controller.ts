import {
  type CreatedDeliveryZoneResponse,
  type DeliveryZonePayload,
  deliveryZonePayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  CreateDeliveryZoneCommand,
  RemoveDeliveryZoneCommand,
  UpdateDeliveryZoneCommand,
} from "../application/delivery-zone.commands.js";

/**
 * Gestion **staff** des zones de livraison (page Réglages → Retraits & livraisons).
 * Ajouter / éditer / supprimer. Montage à deux surfaces habituel (`@Public()`
 * désarme le guard client, `AdminAuthGuard` réarme la porte staff).
 */
@Controller("admin/delivery-zones")
@Public()
@UseGuards(AdminAuthGuard)
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
