import { Global, Module } from "@nestjs/common";

import { DeliveryBinDesk } from "../delivery/application/delivery-bin-desk.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { BinDesk, ContainerManagedOrders } from "../packing/channels/delivery/index.js";
import { PrismaContainerManagedOrders } from "../packing/infrastructure/prisma-container-managed-orders.js";
import { PackingModule } from "../packing/packing.module.js";

/**
 * **Le fil des bacs, relié** (K2b, `colisage/colisage.md`
 * §5–§5.1) — le colisage déclare `packing/channels/delivery/` :
 *
 * - `BinDesk` — la livraison l'implémente (`DeliveryBinDesk`) : déclarer,
 *   annuler, partager un bac, proposer, « ces bacs sont-ils vivants ? » ;
 * - `ContainerManagedOrders` — le colisage l'implémente lui-même, et
 *   l'annulation d'un bac par la livraison le lit pour refuser (ses routes de
 *   déclaration et de partage sont retirées le 2026-10-10).
 *
 * `@Global` pour la raison des autres fils : ni `packing/` ni `delivery/` ne
 * peuvent importer le module de l'autre.
 */
@Global()
@Module({
  imports: [DeliveryModule, PackingModule],
  providers: [
    { provide: BinDesk, useExisting: DeliveryBinDesk },
    { provide: ContainerManagedOrders, useExisting: PrismaContainerManagedOrders },
  ],
  exports: [BinDesk, ContainerManagedOrders],
})
export class PackingDeliveryFeedModule {}
