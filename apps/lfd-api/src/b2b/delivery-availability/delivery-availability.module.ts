import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { UpdateDeliveryAvailabilityHandler } from "./application/commands/update-delivery-availability.handler.js";
import { GetDeliveryAvailabilityHandler } from "./application/queries/get-delivery-availability.handler.js";
import { DeliveryAvailabilityReader } from "./domain/ports/delivery-availability.reader.js";
import { DeliveryAvailabilityRepository } from "./domain/ports/delivery-availability.repository.js";
import { AdminDeliveryAvailabilityController } from "./http/admin-delivery-availability.controller.js";
import { DeliveryAvailabilityController } from "./http/delivery-availability.controller.js";
import { PrismaDeliveryAvailabilityReader } from "./infrastructure/prisma-delivery-availability.reader.js";
import { PrismaDeliveryAvailabilityRepository } from "./infrastructure/prisma-delivery-availability.repository.js";

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
  controllers: [DeliveryAvailabilityController, AdminDeliveryAvailabilityController],
  providers: [
    { provide: DeliveryAvailabilityReader, useClass: PrismaDeliveryAvailabilityReader },
    { provide: DeliveryAvailabilityRepository, useClass: PrismaDeliveryAvailabilityRepository },
    GetDeliveryAvailabilityHandler,
    UpdateDeliveryAvailabilityHandler,
  ],
  exports: [DeliveryAvailabilityReader],
})
export class DeliveryAvailabilityModule {}
