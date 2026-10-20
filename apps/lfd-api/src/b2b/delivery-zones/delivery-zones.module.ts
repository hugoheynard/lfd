import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { CreateDeliveryZoneHandler } from "./application/create-delivery-zone.handler.js";
import { RemoveDeliveryZoneHandler } from "./application/remove-delivery-zone.handler.js";
import { UpdateDeliveryZoneHandler } from "./application/update-delivery-zone.handler.js";
import { ListDeliveryZonesHandler } from "./application/list-delivery-zones.handler.js";
import { ListUncoveredPostalCodesHandler } from "./application/list-uncovered-postal-codes.handler.js";
import { DeliveryZoneRepository } from "./domain/delivery-zone.repository.js";
import { PrismaDeliveryZoneRepository } from "./infrastructure/prisma-delivery-zone.repository.js";
import { AdminDeliveryZonesController } from "./http/admin-delivery-zones.controller.js";
import { DeliveryZonesController } from "./http/delivery-zones.controller.js";

/**
 * **Zones de livraison** (globales) — code postal → frais de livraison. Exporte
 * `DeliveryZoneRepository` : le contexte `orders` en a besoin pour calculer le
 * frais d'une commande livrée vers une zone. Importe `AccountModule` pour le
 * seul port des codes postaux de livraison (comptes non couverts, 2026-10-20).
 */
@Module({
  imports: [AccountModule],
  controllers: [DeliveryZonesController, AdminDeliveryZonesController],
  providers: [
    { provide: DeliveryZoneRepository, useClass: PrismaDeliveryZoneRepository },
    ListDeliveryZonesHandler,
    ListUncoveredPostalCodesHandler,
    CreateDeliveryZoneHandler,
    UpdateDeliveryZoneHandler,
    RemoveDeliveryZoneHandler,
  ],
  exports: [DeliveryZoneRepository],
})
export class DeliveryZonesModule {}
