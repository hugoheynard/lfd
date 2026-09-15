import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { UpdateDeliverySettingsHandler } from "./application/commands/update-delivery-settings.handler.js";
import { GetDeliverySettingsHandler } from "./application/queries/get-delivery-settings.handler.js";
import { DeliverySettingsReader } from "./domain/ports/delivery-settings.reader.js";
import { DeliverySettingsRepository } from "./domain/ports/delivery-settings.repository.js";
import { AdminDeliverySettingsController } from "./http/admin-delivery-settings.controller.js";
import { DeliverySettingsController } from "./http/delivery-settings.controller.js";
import { PrismaDeliverySettingsReader } from "./infrastructure/prisma-delivery-settings.reader.js";
import { PrismaDeliverySettingsRepository } from "./infrastructure/prisma-delivery-settings.repository.js";

/**
 * **À qui la livraison est proposée** — un réglage global.
 * Plan : `documentation/b2b/plan-remise-et-livraison-par-clientele.md`, D4.
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` (l'auteur figé du geste).
 * Exporte le port de LECTURE seul : `orders` refuse une livraison fermée, il ne
 * la pose jamais.
 */
@Module({
  imports: [AccountModule],
  controllers: [DeliverySettingsController, AdminDeliverySettingsController],
  providers: [
    { provide: DeliverySettingsReader, useClass: PrismaDeliverySettingsReader },
    { provide: DeliverySettingsRepository, useClass: PrismaDeliverySettingsRepository },
    GetDeliverySettingsHandler,
    UpdateDeliverySettingsHandler,
  ],
  exports: [DeliverySettingsReader],
})
export class DeliverySettingsModule {}
