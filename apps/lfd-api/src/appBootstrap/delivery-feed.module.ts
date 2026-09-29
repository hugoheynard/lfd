import { Global, Module } from "@nestjs/common";

import { PrismaDeliveryOrdersReader } from "../b2b/orders/infrastructure/prisma-delivery-orders.reader.js";
import { PickupAddressesModule } from "../b2b/pickup-addresses/pickup-addresses.module.js";
import { PickupDepartureCandidatesReader } from "../b2b/pickup-addresses/infrastructure/pickup-departure-candidates.reader.js";
import {
  DeliveryOrdersReader,
  DepartureCandidatesReader,
} from "../delivery/channels/commerce/index.js";

/**
 * **Le fil de la livraison, relié** — la livraison déclare, le commerce
 * implémente :
 *
 * - `DepartureCandidatesReader` — les points de retrait candidats au départ des
 *   tournées (`plan-preparation-de-tournee.md`, Q9) ;
 * - `DeliveryOrdersReader` — les livraisons attendues d'un jour, et les
 *   commandes composées relues par leur id (lot 3, C4). Il n'a besoin que de
 *   `PrismaService`, global : aucun module du commerce à importer pour lui.
 *
 * `@Global` pour la raison des autres fils : le consommateur est `delivery/`,
 * qui ne peut pas importer le module qui fournit le port sans dépendre du
 * commerce. Le jeton reste celui du contexte déclarant.
 */
@Global()
@Module({
  imports: [PickupAddressesModule],
  providers: [
    { provide: DepartureCandidatesReader, useClass: PickupDepartureCandidatesReader },
    { provide: DeliveryOrdersReader, useClass: PrismaDeliveryOrdersReader },
  ],
  exports: [DepartureCandidatesReader, DeliveryOrdersReader],
})
export class DeliveryFeedModule {}
