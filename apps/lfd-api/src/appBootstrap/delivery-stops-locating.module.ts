import { Global, Module } from "@nestjs/common";

import { DeliveryOrderPlacedListener } from "../delivery/channels/commerce/index.js";
import { DeliveryStopsLocating } from "../delivery/application/delivery-stops-locating.js";
import { DeliveryModule } from "../delivery/delivery.module.js";

/**
 * **Situer l'adresse dès la commande, relié** (`documentation/livraisons/tournees/composition-automatique.md`,
 * lot CA0) — la livraison déclare ET implémente `DeliveryOrderPlacedListener`,
 * le commerce l'appelle sur `order.placed`.
 *
 * Module à part : `DeliveryFeedModule` importe `OrdersModule`, qui est
 * justement l'appelant. `@Global` pour la raison des autres fils : le commerce
 * ne peut pas importer `DeliveryModule`. `useExisting` : une seule instance,
 * celle que les abonnés de l'arrêt du plan utilisent aussi.
 */
@Global()
@Module({
  imports: [DeliveryModule],
  providers: [{ provide: DeliveryOrderPlacedListener, useExisting: DeliveryStopsLocating }],
  exports: [DeliveryOrderPlacedListener],
})
export class DeliveryStopsLocatingModule {}
