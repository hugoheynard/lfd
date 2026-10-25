import {
  type PackingSettingsPayload,
  packingSettingsPayloadSchema,
  type PackingSettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { SetPackingSettingsCommand } from "../application/settings/set-packing-settings.command.js";
import { GetPackingSettingsQuery } from "../application/settings/get-packing-settings.query.js";

/**
 * **Réglages › Colisage** (Hugo, 2026-10-25). Sous `delivery_settings`, le
 * droit des bacs et des contenances : partager une moitié est une façon
 * d'occuper un BAC, et qui règle les bacs règle ce partage. Aucun droit neuf.
 *
 * La lecture s'ouvre aussi à `production_packing:read` : le poste doit savoir
 * s'il montre « Partager une moitié », sans pouvoir le régler.
 *
 * Il n'injecte que les bus.
 */
@Controller("admin/packing/settings")
@AdminSurface("delivery_settings")
export class PackingSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission("delivery_settings:read", "production_packing:read")
  read(): Promise<PackingSettingsView> {
    return this.queries.execute<GetPackingSettingsQuery, PackingSettingsView>(
      new GetPackingSettingsQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Body(new ZodBody(packingSettingsPayloadSchema)) payload: PackingSettingsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetPackingSettingsCommand, void>(
      new SetPackingSettingsCommand(payload.halfSharing, staffUserId),
    );
  }
}
