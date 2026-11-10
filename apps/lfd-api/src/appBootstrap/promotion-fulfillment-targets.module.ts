import { Global, Module } from "@nestjs/common";

import { PromotionsTargetingZoneReader } from "../lafoliecoffee/delivery-zones/domain/ports/promotions-targeting-zone.reader.js";
import { PrismaDeliveryZoneDirectory } from "../lafoliecoffee/delivery-zones/infrastructure/prisma-delivery-zone.directory.js";
import { DeliveryZoneDirectory } from "../lafoliecoffee/promotions/domain/ports/delivery-zone.directory.js";
import { PickupPointDirectory } from "../lafoliecoffee/promotions/domain/ports/pickup-point.directory.js";
import { PrismaPromotionsTargetingZoneReader } from "../lafoliecoffee/promotions/infrastructure/prisma-promotions-targeting-zone.reader.js";
import { PrismaPickupPointDirectory } from "../lafoliecoffee/sites/infrastructure/prisma-pickup-point.directory.js";

/**
 * Le fil entre **les promotions et ce que leur acheminement nomme** (`documentation/promotions/promotions.md`, § 2.14) :
 *
 * - les promotions demandent « ces zones, ces points existent-ils, et leurs
 *   noms ? » (`DeliveryZoneDirectory`, `PickupPointDirectory`) ;
 * - les zones demandent « quelles promotions me nomment ? »
 *   (`PromotionsTargetingZoneReader`), avant de se laisser supprimer.
 *
 * Chacun déclare son port, l'autre l'implémente, et le câblage vit ici :
 * aucun des modules n'importe l'autre, donc aucun cycle. `@Global` parce que
 * les consommateurs ne peuvent pas importer ce module. Les adaptateurs ne
 * lisent que `PrismaService`.
 */
@Global()
@Module({
  providers: [
    { provide: DeliveryZoneDirectory, useClass: PrismaDeliveryZoneDirectory },
    { provide: PickupPointDirectory, useClass: PrismaPickupPointDirectory },
    { provide: PromotionsTargetingZoneReader, useClass: PrismaPromotionsTargetingZoneReader },
  ],
  exports: [DeliveryZoneDirectory, PickupPointDirectory, PromotionsTargetingZoneReader],
})
export class PromotionFulfillmentTargetsModule {}
