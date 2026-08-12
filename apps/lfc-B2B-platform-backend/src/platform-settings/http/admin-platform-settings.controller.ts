import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { type PlatformSettings, platformSettingsSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { UpdatePlatformSettingsCommand } from "../application/update-platform-settings.command.js";

/**
 * Écriture **staff** des réglages plateforme (page Réglages admin). Même montage
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 * ({@link PlatformSettingsController}).
 */
@Controller("admin/platform-settings")
@AdminSurface("settings")
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
