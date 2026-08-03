import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { GetPlatformSettingsHandler } from "./application/get-platform-settings.handler.js";
import { UpdatePlatformSettingsHandler } from "./application/update-platform-settings.handler.js";
import { PlatformSettingsRepository } from "./domain/platform-settings.repository.js";
import { PrismaPlatformSettingsRepository } from "./infrastructure/prisma-platform-settings.repository.js";
import { AdminPlatformSettingsController } from "./http/admin-platform-settings.controller.js";
import { PlatformSettingsController } from "./http/platform-settings.controller.js";

/**
 * Réglages **globaux** de la plateforme B2B (config des pièces d'activation).
 * Exporte `PlatformSettingsRepository` : le contexte `account` en a besoin pour
 * **gater l'activation** d'une société (cf. `ActivateCompanyByStaffCommand`).
 */
@Module({
  imports: [CqrsModule],
  controllers: [PlatformSettingsController, AdminPlatformSettingsController],
  providers: [
    { provide: PlatformSettingsRepository, useClass: PrismaPlatformSettingsRepository },
    GetPlatformSettingsHandler,
    UpdatePlatformSettingsHandler,
  ],
  exports: [PlatformSettingsRepository],
})
export class PlatformSettingsModule {}
