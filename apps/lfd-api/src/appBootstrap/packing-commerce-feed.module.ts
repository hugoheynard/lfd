import { Global, Module } from "@nestjs/common";

import { PackingOrderBagLabelReader } from "../b2b/orders/infrastructure/packing-order-bag-label.reader.js";
import { OrdersModule } from "../b2b/orders/orders.module.js";
import { OrderBagLabelReader } from "../packing/channels/commerce/index.js";

/**
 * **Ce que le colisage demande au commerce de la commande**, relié
 * (2026-10-25) : `OrderBagLabelReader` — la couleur et le QR de retrait de
 * l'étiquette d'un sac. Le colisage déclare, le commerce implémente.
 *
 * `@Global` pour la raison des autres fils : `packing/` ne peut pas importer
 * le module du commerce sans franchir la frontière.
 */
@Global()
@Module({
  imports: [OrdersModule],
  providers: [{ provide: OrderBagLabelReader, useExisting: PackingOrderBagLabelReader }],
  exports: [OrderBagLabelReader],
})
export class PackingCommerceFeedModule {}
