import { Global, Module } from "@nestjs/common";

import { CatalogModule } from "../b2b/catalog/catalog.module.js";
import { CatalogDeliveryProductsReader } from "../b2b/catalog/infrastructure/catalog-delivery-products.reader.js";
import { PrismaDeliveryOrderLinesReader } from "../b2b/orders/infrastructure/prisma-delivery-order-lines.reader.js";
import { PrismaDeliveryOrdersReader } from "../b2b/orders/infrastructure/prisma-delivery-orders.reader.js";
import { PickupAddressesModule } from "../b2b/pickup-addresses/pickup-addresses.module.js";
import { PickupDepartureCandidatesReader } from "../b2b/pickup-addresses/infrastructure/pickup-departure-candidates.reader.js";
import {
  DeliveryOrderLinesReader,
  DeliveryOrdersReader,
  DeliveryProductsReader,
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
 *   `PrismaService`, global : aucun module du commerce à importer pour lui ;
 * - `DeliveryProductsReader` — le catalogue B2B vendu (SKU et nom), pour la
 *   grille des contenances des bacs (lot 4 bis, v2-2). Son adaptateur vit chez
 *   `catalog/`, qui exporte `ProductCatalogReader` : d'où `CatalogModule` ;
 * - `DeliveryOrderLinesReader` — les lignes d'une commande (SKU, nom figé,
 *   quantité), pour le colisage proposé (lot 4 bis, L4b-C4).
 *
 * `@Global` pour la raison des autres fils : le consommateur est `delivery/`,
 * qui ne peut pas importer le module qui fournit le port sans dépendre du
 * commerce. Le jeton reste celui du contexte déclarant.
 */
@Global()
@Module({
  imports: [PickupAddressesModule, CatalogModule],
  providers: [
    { provide: DepartureCandidatesReader, useClass: PickupDepartureCandidatesReader },
    { provide: DeliveryOrdersReader, useClass: PrismaDeliveryOrdersReader },
    { provide: DeliveryProductsReader, useClass: CatalogDeliveryProductsReader },
    { provide: DeliveryOrderLinesReader, useClass: PrismaDeliveryOrderLinesReader },
  ],
  exports: [
    DepartureCandidatesReader,
    DeliveryOrdersReader,
    DeliveryProductsReader,
    DeliveryOrderLinesReader,
  ],
})
export class DeliveryFeedModule {}
