import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import {
  CreateDeliveryZoneHandler,
  RemoveDeliveryZoneHandler,
  UpdateDeliveryZoneHandler,
} from "./application/delivery-zone.handlers.js";
import { ListDeliveryZonesHandler } from "./application/list-delivery-zones.handler.js";
import { DeliveryZoneRepository } from "./domain/delivery-zone.repository.js";
import { PrismaDeliveryZoneRepository } from "./infrastructure/prisma-delivery-zone.repository.js";
import { AdminDeliveryZonesController } from "./http/admin-delivery-zones.controller.js";
import { DeliveryZonesController } from "./http/delivery-zones.controller.js";

/**
 * **Zones de livraison** (globales) — code postal → frais de livraison. Exporte
 * `DeliveryZoneRepository` : le contexte `orders` en a besoin pour calculer le
 * frais d'une commande livrée vers une zone.
 */
@Module({
  imports: [CqrsModule],
  controllers: [DeliveryZonesController, AdminDeliveryZonesController],
  providers: [
    { provide: DeliveryZoneRepository, useClass: PrismaDeliveryZoneRepository },
    ListDeliveryZonesHandler,
    CreateDeliveryZoneHandler,
    UpdateDeliveryZoneHandler,
    RemoveDeliveryZoneHandler,
  ],
  exports: [DeliveryZoneRepository],
})
export class DeliveryZonesModule {}
