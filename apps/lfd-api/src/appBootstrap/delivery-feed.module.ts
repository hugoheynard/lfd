import { Global, Module } from "@nestjs/common";

import { AccountModule } from "../b2b/account/account.module.js";
import { CommerceDeliveryAddressPointCorrector } from "../b2b/account/application/services/commerce-delivery-address-point-corrector.js";
import { CatalogModule } from "../b2b/catalog/catalog.module.js";
import { CatalogDeliveryProductsReader } from "../b2b/catalog/infrastructure/catalog-delivery-products.reader.js";
import { OrdersModule } from "../b2b/orders/orders.module.js";
import { PrismaCommerceDayVersionReader } from "../b2b/orders/infrastructure/prisma-commerce-day-version.reader.js";
import { PrismaDeliveryOrderStatesReader } from "../b2b/orders/infrastructure/prisma-delivery-order-states.reader.js";
import { PrismaDeliveryDeparturesReader } from "../b2b/orders/infrastructure/prisma-delivery-departures.reader.js";
import { PrismaDeliveryOrderLinesReader } from "../b2b/orders/infrastructure/prisma-delivery-order-lines.reader.js";
import { PrismaDeliveryAddressPointsReader } from "../b2b/orders/infrastructure/prisma-delivery-address-points.reader.js";
import { PrismaDeliveryOrdersReader } from "../b2b/orders/infrastructure/prisma-delivery-orders.reader.js";
import { PrismaDeliveryProceduresReader } from "../b2b/orders/infrastructure/prisma-delivery-procedures.reader.js";
import { PrismaDeliveryStepPhotosReader } from "../b2b/orders/infrastructure/prisma-delivery-step-photos.reader.js";
import {
  PrismaTransferOrderContentsReader,
  PrismaTransferOrdersReader,
} from "../b2b/orders/infrastructure/prisma-transfer-orders.reader.js";
import { CommerceTransferSites } from "../b2b/orders/application/services/commerce-transfer-sites.service.js";
import { PickupAddressesModule } from "../b2b/pickup-addresses/pickup-addresses.module.js";
import { PickupDepartureCandidatesReader } from "../b2b/pickup-addresses/infrastructure/pickup-departure-candidates.reader.js";
import { SiteTransferPlacesReader } from "../b2b/pickup-addresses/infrastructure/site-transfer-places.reader.js";
import { DeliveryTransferOrderColorsReader } from "../b2b/orders/infrastructure/delivery-transfer-order-colors.reader.js";
import { DeliveryBinLabelColorsReader } from "../b2b/orders/infrastructure/delivery-bin-label-colors.reader.js";
import { SiteDeliveryColorsReader } from "../b2b/sites/infrastructure/site-delivery-colors.reader.js";
import { SiteTransferColorsReader } from "../b2b/sites/infrastructure/site-transfer-colors.reader.js";
import { SitesModule } from "../b2b/sites/sites.module.js";
import {
  CommerceDayVersionReader,
  DeliveryAddressPointCorrector,
  DeliveryColorsReader,
  TransferOrderColorsReader,
  TransferSiteColorsReader,
  BinLabelColorsReader,
  DeliveryAddressPointsReader,
  DeliveryDeparturesReader,
  DeliveryOrderLinesReader,
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
  DeliveryProceduresReader,
  DeliveryProductsReader,
  DeliveryStepPhotosReader,
  DepartureCandidatesReader,
  DepartureSiteReader,
  OrderDeliveryHistoryReader,
  RoadTravelTimeReader,
  TransferOrderContentsReader,
  TransferOrdersReader,
  TransferSitePlacesReader,
  TransferSitesReader,
} from "../delivery/channels/commerce/index.js";
import { PrismaOrderDeliveryHistoryReader } from "../delivery/infrastructure/prisma-order-delivery-history.reader.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { RoutedTravelTimeReader } from "../delivery/infrastructure/routed-travel-time.reader.js";
import { ResolvedDepartureSiteReader } from "../delivery/infrastructure/resolved-departure-site.reader.js";

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
 * - `DeliveryDeparturesReader` — ce qui PART d'une commande (départ incomplet
 *   décidé compris), pour la fiche de « Ma tournée » (2026-10-25) ;
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
 * Et un fil dans l'AUTRE sens (2026-10-08, DF3) : `OrderDeliveryHistoryReader`
 * — la livraison déclare ET implémente, la comptabilité du commerce lit les
 * arrêts de ses bons pour le dossier de facturation. Et `DepartureSiteReader`
 * (2026-10-13) : le commerce demande quel site est le départ des tournées,
 * pour refuser d'y retirer « Livraison ». Et `RoadTravelTimeReader` (T0,
 * 2026-10-13) : la durée de route d'un transfert interne, calculée par la
 * matrice du bloc — d'où l'import de `DeliveryModule`, qui en garde l'adaptateur.
 * Et le transfert interne (lot T1, 2026-10-13) : `TransferOrdersReader` (les
 * retraits des sites servis par transfert), `TransferSitesReader` (nom, point,
 * mode, heure d'arrivée — `CommerceTransferSites`, exporté par `OrdersModule`)
 * et `TransferOrderContentsReader` (le contenu, pour le manifeste). Et
 * `TransferSitePlacesReader` (2026-10-13) : l'adresse et le point du site,
 * pour « Y aller » et la feuille de route — sans calcul routier.
 *
 * `@Global` pour la raison des autres fils : le consommateur est `delivery/`,
 * qui ne peut pas importer le module qui fournit le port sans dépendre du
 * commerce. Le jeton reste celui du contexte déclarant.
 */
@Global()
@Module({
  imports: [
    PickupAddressesModule,
    CatalogModule,
    AccountModule,
    OrdersModule,
    DeliveryModule,
    SitesModule,
  ],
  providers: [
    { provide: DepartureCandidatesReader, useClass: PickupDepartureCandidatesReader },
    { provide: DeliveryOrdersReader, useClass: PrismaDeliveryOrdersReader },
    { provide: DeliveryProductsReader, useClass: CatalogDeliveryProductsReader },
    { provide: DeliveryOrderLinesReader, useClass: PrismaDeliveryOrderLinesReader },
    { provide: DeliveryDeparturesReader, useClass: PrismaDeliveryDeparturesReader },
    { provide: DeliveryProceduresReader, useClass: PrismaDeliveryProceduresReader },
    { provide: DeliveryStepPhotosReader, useClass: PrismaDeliveryStepPhotosReader },
    { provide: DeliveryOrderStatesReader, useClass: PrismaDeliveryOrderStatesReader },
    { provide: CommerceDayVersionReader, useClass: PrismaCommerceDayVersionReader },
    { provide: DeliveryAddressPointsReader, useClass: PrismaDeliveryAddressPointsReader },
    {
      provide: DeliveryAddressPointCorrector,
      useExisting: CommerceDeliveryAddressPointCorrector,
    },
    { provide: OrderDeliveryHistoryReader, useClass: PrismaOrderDeliveryHistoryReader },
    { provide: DepartureSiteReader, useClass: ResolvedDepartureSiteReader },
    { provide: RoadTravelTimeReader, useExisting: RoutedTravelTimeReader },
    { provide: TransferOrdersReader, useClass: PrismaTransferOrdersReader },
    { provide: TransferOrderContentsReader, useClass: PrismaTransferOrderContentsReader },
    { provide: TransferSitesReader, useExisting: CommerceTransferSites },
    { provide: TransferSitePlacesReader, useClass: SiteTransferPlacesReader },
    { provide: DeliveryColorsReader, useClass: SiteDeliveryColorsReader },
    // La pastille par commande du transfert imprimé (2026-10-22) : la règle du bon.
    { provide: TransferOrderColorsReader, useClass: DeliveryTransferOrderColorsReader },
    // Le carré de l'étiquette de bac imprimée (2026-10-25) : la règle du bon.
    { provide: BinLabelColorsReader, useClass: DeliveryBinLabelColorsReader },
    // Le carré d'un transfert dans le dossier des tournées (2026-10-26).
    { provide: TransferSiteColorsReader, useClass: SiteTransferColorsReader },
  ],
  exports: [
    DepartureCandidatesReader,
    DeliveryOrdersReader,
    DeliveryProductsReader,
    DeliveryOrderLinesReader,
    DeliveryDeparturesReader,
    DeliveryProceduresReader,
    DeliveryStepPhotosReader,
    DeliveryOrderStatesReader,
    CommerceDayVersionReader,
    DeliveryAddressPointsReader,
    DeliveryAddressPointCorrector,
    OrderDeliveryHistoryReader,
    DepartureSiteReader,
    RoadTravelTimeReader,
    TransferOrdersReader,
    TransferOrderContentsReader,
    TransferSitesReader,
    TransferSitePlacesReader,
    DeliveryColorsReader,
    TransferOrderColorsReader,
    BinLabelColorsReader,
    TransferSiteColorsReader,
  ],
})
export class DeliveryFeedModule {}
