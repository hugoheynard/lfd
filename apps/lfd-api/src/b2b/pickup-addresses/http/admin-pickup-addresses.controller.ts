import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type CreatedPickupResponse,
  type PickupAddressPayload,
  pickupAddressPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  CreatePickupAddressCommand,
  RemovePickupAddressCommand,
  SetDefaultPickupAddressCommand,
  UpdatePickupAddressCommand,
} from "../application/pickup-address.commands.js";

/**
 * Gestion **staff** des points de retrait (page Réglages). Ajouter / éditer /
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin/pickup-addresses")
@AdminSurface("b2b_settings")
export class AdminPickupAddressesController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(pickupAddressPayloadSchema)) payload: PickupAddressPayload,
  ): Promise<CreatedPickupResponse> {
    const id = await this.commands.execute<CreatePickupAddressCommand, string>(
      new CreatePickupAddressCommand(payload),
    );
    return { id };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(pickupAddressPayloadSchema)) payload: PickupAddressPayload,
  ): Promise<void> {
    await this.commands.execute<UpdatePickupAddressCommand, void>(
      new UpdatePickupAddressCommand(id, payload),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemovePickupAddressCommand, void>(
      new RemovePickupAddressCommand(id),
    );
  }

  @Patch(":id/default")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setDefault(@Param("id") id: string): Promise<void> {
    await this.commands.execute<SetDefaultPickupAddressCommand, void>(
      new SetDefaultPickupAddressCommand(id),
    );
  }
}
