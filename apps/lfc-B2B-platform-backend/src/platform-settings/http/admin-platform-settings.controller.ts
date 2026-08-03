import { type PlatformSettings, platformSettingsSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Patch, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { UpdatePlatformSettingsCommand } from "../application/update-platform-settings.command.js";

/**
 * Écriture **staff** des réglages plateforme (page Réglages admin). Même montage
 * à deux surfaces que les autres contrôleurs admin : `@Public()` désarme le guard
 * client, `AdminAuthGuard` réarme la porte staff. La lecture est publique
 * ({@link PlatformSettingsController}).
 */
@Controller("admin/platform-settings")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminPlatformSettingsController {
  constructor(private readonly commands: CommandBus) {}

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(platformSettingsSchema)) payload: PlatformSettings,
  ): Promise<void> {
    await this.commands.execute<UpdatePlatformSettingsCommand, void>(
      new UpdatePlatformSettingsCommand(payload),
    );
  }
}
