import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { CreateDeliveryZoneHandler } from "./application/create-delivery-zone.handler.js";
import { RemoveDeliveryZoneHandler } from "./application/remove-delivery-zone.handler.js";
import { UpdateDeliveryZoneHandler } from "./application/update-delivery-zone.handler.js";
import { ListDeliveryZonesHandler } from "./application/list-delivery-zones.handler.js";
import { ListUncoveredPostalCodesHandler } from "./application/list-uncovered-postal-codes.handler.js";
import { DeliveryZoneOfPostalCodeReader } from "../orders/domain/ports/delivery-zone-of-postal-code.reader.js";
import { DeliveryZoneOfPostalCodeResolver } from "./application/delivery-zone-of-postal-code.resolver.js";
import { DeliveryZoneRepository } from "./domain/delivery-zone.repository.js";
import { DeliveryZoneLock } from "./domain/ports/delivery-zone-lock.js";
import { PrismaDeliveryZoneLock } from "./infrastructure/prisma-delivery-zone-lock.js";
import { PrismaDeliveryZoneRepository } from "./infrastructure/prisma-delivery-zone.repository.js";
import { AdminDeliveryZonesController } from "./http/admin-delivery-zones.controller.js";
import { AdminDeliveryPricingController } from "./http/admin-delivery-pricing.controller.js";
import { GetDeliveryPricingHandler } from "./application/get-delivery-pricing.handler.js";
import { UpdateDeliveryPricingHandler } from "./application/update-delivery-pricing.handler.js";
import { DeliveryPricingReader } from "./domain/ports/delivery-pricing.reader.js";
import { DeliveryPricingRepository } from "./domain/ports/delivery-pricing.repository.js";
import { PrismaDeliveryPricingReader } from "./infrastructure/prisma-delivery-pricing.reader.js";
import { PrismaDeliveryPricingRepository } from "./infrastructure/prisma-delivery-pricing.repository.js";
import { DeliveryZonesController } from "./http/delivery-zones.controller.js";

/**
 * **Zones de livraison** (globales) — code postal → frais de livraison. Exporte
 * `DeliveryZoneRepository` : le contexte `orders` en a besoin pour calculer le
 * frais d'une commande livrée vers une zone, et `DeliveryZoneOfPostalCodeReader`,
 * la zone d'un code postal pour le fait d'acheminement des promotions. Importe `AccountModule` pour le
 * port des codes postaux de livraison (comptes non couverts, 2026-10-20) et
 * pour `StaffDirectory`, l'auteur figé du réglage global par audience (0a).
 */
@Module({
  imports: [AccountModule],
  controllers: [
    DeliveryZonesController,
    AdminDeliveryZonesController,
    AdminDeliveryPricingController,
  ],
  providers: [
    { provide: DeliveryZoneRepository, useClass: PrismaDeliveryZoneRepository },
    { provide: DeliveryZoneLock, useClass: PrismaDeliveryZoneLock },
    { provide: DeliveryZoneOfPostalCodeReader, useClass: DeliveryZoneOfPostalCodeResolver },
    ListDeliveryZonesHandler,
    ListUncoveredPostalCodesHandler,
    CreateDeliveryZoneHandler,
    UpdateDeliveryZoneHandler,
    RemoveDeliveryZoneHandler,
    { provide: DeliveryPricingReader, useClass: PrismaDeliveryPricingReader },
    { provide: DeliveryPricingRepository, useClass: PrismaDeliveryPricingRepository },
    GetDeliveryPricingHandler,
    UpdateDeliveryPricingHandler,
  ],
  exports: [DeliveryZoneRepository, DeliveryZoneOfPostalCodeReader],
})
export class DeliveryZonesModule {}
