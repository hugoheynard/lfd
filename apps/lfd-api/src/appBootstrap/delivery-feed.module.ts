import { Global, Module } from "@nestjs/common";

import { AccountModule } from "../b2b/account/account.module.js";
import { CommerceDeliveryAddressPointCorrector } from "../b2b/account/application/services/commerce-delivery-address-point-corrector.js";
import { CatalogModule } from "../b2b/catalog/catalog.module.js";
import { CatalogDeliveryProductsReader } from "../b2b/catalog/infrastructure/catalog-delivery-products.reader.js";
import { OrdersModule } from "../b2b/orders/orders.module.js";
import { PrismaCommerceDayVersionReader } from "../b2b/orders/infrastructure/prisma-commerce-day-version.reader.js";
import { PrismaDeliveryOrderStatesReader } from "../b2b/orders/infrastructure/prisma-delivery-order-states.reader.js";
import { PrismaDeliveryOrderLinesReader } from "../b2b/orders/infrastructure/prisma-delivery-order-lines.reader.js";
import { PrismaDeliveryAddressPointsReader } from "../b2b/orders/infrastructure/prisma-delivery-address-points.reader.js";
import { PrismaDeliveryOrdersReader } from "../b2b/orders/infrastructure/prisma-delivery-orders.reader.js";
import { PrismaDeliveryProceduresReader } from "../b2b/orders/infrastructure/prisma-delivery-procedures.reader.js";
import { PrismaDeliveryStepPhotosReader } from "../b2b/orders/infrastructure/prisma-delivery-step-photos.reader.js";
import { PickupAddressesModule } from "../b2b/pickup-addresses/pickup-addresses.module.js";
import { PickupDepartureCandidatesReader } from "../b2b/pickup-addresses/infrastructure/pickup-departure-candidates.reader.js";
import {
  CommerceDayVersionReader,
  DeliveryAddressPointCorrector,
  DeliveryAddressPointsReader,
  DeliveryOrderLinesReader,
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
  DeliveryProceduresReader,
  DeliveryProductsReader,
  DeliveryStepPhotosReader,
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
 *   quantité), pour le colisage proposé (lot 4 bis, L4b-C4) ;
 * - `DeliveryProceduresReader` — la procédure de l'adresse d'une commande, lue
 *   vivante pour le livreur (plan « Ma tournée », MT-D5 v2) ;
 * - `DeliveryStepPhotosReader` — la photo d'une étape de cette procédure,
 *   par le chemin de lecture de la route du staff : d'où `AccountModule`,
 *   qui exporte `DeliveryStepPhotoLocator` ;
 * - `CommerceDayVersionReader` — la version de journée du commerce, pour la
 *   version de « ma tournée » (`parcours-du-livreur.md`, PL4) ;
 * - `DeliveryAddressPointsReader` — l'adresse du carnet derrière une commande
 *   livrée, et ses deux points, pour les suggestions de correction
 *   (`gps-y-aller-et-position.md`, §6) ;
 * - `DeliveryAddressPointCorrector` — « corrige ce point du carnet » : le
 *   carnet décide et écrit, le commerce journalise. Son adaptateur vit dans
 *   `AccountModule` : `useExisting`.
 *
 * `@Global` pour la raison des autres fils : le consommateur est `delivery/`,
 * qui ne peut pas importer le module qui fournit le port sans dépendre du
 * commerce. Le jeton reste celui du contexte déclarant.
 */
@Global()
@Module({
  imports: [PickupAddressesModule, CatalogModule, AccountModule, OrdersModule],
  providers: [
    { provide: DepartureCandidatesReader, useClass: PickupDepartureCandidatesReader },
    { provide: DeliveryOrdersReader, useClass: PrismaDeliveryOrdersReader },
    { provide: DeliveryProductsReader, useClass: CatalogDeliveryProductsReader },
    { provide: DeliveryOrderLinesReader, useClass: PrismaDeliveryOrderLinesReader },
    { provide: DeliveryProceduresReader, useClass: PrismaDeliveryProceduresReader },
    { provide: DeliveryStepPhotosReader, useClass: PrismaDeliveryStepPhotosReader },
    { provide: DeliveryOrderStatesReader, useClass: PrismaDeliveryOrderStatesReader },
    { provide: CommerceDayVersionReader, useClass: PrismaCommerceDayVersionReader },
    { provide: DeliveryAddressPointsReader, useClass: PrismaDeliveryAddressPointsReader },
    {
      provide: DeliveryAddressPointCorrector,
      useExisting: CommerceDeliveryAddressPointCorrector,
    },
  ],
  exports: [
    DepartureCandidatesReader,
    DeliveryOrdersReader,
    DeliveryProductsReader,
    DeliveryOrderLinesReader,
    DeliveryProceduresReader,
    DeliveryStepPhotosReader,
    DeliveryOrderStatesReader,
    CommerceDayVersionReader,
    DeliveryAddressPointsReader,
    DeliveryAddressPointCorrector,
  ],
})
export class DeliveryFeedModule {}
