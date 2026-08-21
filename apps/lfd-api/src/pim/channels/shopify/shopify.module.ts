import { Module } from "@nestjs/common";
import {
  ShopifyAdminClient,
  ShopifyTokenProvider,
  type ShopifyCredentialsSource,
  type ShopifyStoreSettings,
} from "@lfd/shopify-admin";

import { CatalogueModule } from "../../catalogue/catalogue.module.js";
import { CommerceModule } from "../../commerce/commerce.module.js";
import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { ShopifyCollectionsController } from "./collections/collections.controller.js";
import { ShopifyCollectionsService } from "./collections/collections.service.js";
import {
  DryRunShopifyCollectionsGateway,
  LiveShopifyCollectionsGateway,
} from "./collections/gateway.js";
import { TaxCollectionsPlan } from "./collections/tax-collections.plan.js";
import { ChannelController } from "./connection/channel.controller.js";
import { ShopifyConnectionService } from "./connection/connection.service.js";
import { DryRunShopifyDriver, LiveShopifyDriver } from "./products/driver.js";
import { ShopifyInspectionService } from "./products/inspection.service.js";
import { ShopifyMembershipService } from "./products/membership.service.js";
import { ShopifyProductsController } from "./products/products.controller.js";
import { ShopifyPushService } from "./products/push.service.js";
import { ShopifyReconciliationService } from "./products/reconciliation.service.js";
import { ShopifySnapshotService } from "./products/snapshot.service.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { ShopifySettingsService } from "./shared/settings.service.js";

/** Jeton d'injection du port de credentials — aliasé sur `AppConfig` ci-dessous. */
const SHOPIFY_CREDENTIALS_SOURCE = Symbol("SHOPIFY_CREDENTIALS_SOURCE");

/**
 * Adaptateur de canal — il **dépend** du catalogue, jamais l'inverse.
 *
 * Il n'importe pas les dépôts du catalogue mais son `CatalogueReader`, seul contrat
 * exporté (ADR-13). Supprimer ce module ne casserait rien en amont.
 */
@Module({
  // `CommerceModule` pour son `TvaRegimeRepository` : les collections de taxe
  // se dérivent des régimes. Un PORT exporté, pas une table — la règle d'ADR-13
  // tient, et la dépendance va bien du canal vers le centre.
  imports: [PimDatabaseModule, CatalogueModule, CommerceModule],
  // Un contrôleur par thématique, sous le préfixe module `channels/shopify`
  // (monté par `RouterModule` dans `AppModule` — un module ne pouvant pas se
  // référencer lui-même dans `RouterModule.register`) :
  //   ChannelController            → settings + verify (connexion au canal)
  //   ShopifyCollectionsController → collections/tva (inspect + push)
  //   ShopifyProductsController    → products (bindings + push)
  controllers: [ChannelController, ShopifyCollectionsController, ShopifyProductsController],
  providers: [
    ShopifySettingsService,
    ShopifyPushService,
    ShopifySnapshotService,
    ShopifyReconciliationService,
    ShopifyMembershipService,
    ShopifyInspectionService,
    // Les deux pilotes de push, concrets : le service choisit selon le mode des réglages.
    DryRunShopifyDriver,
    LiveShopifyDriver,
    // Transport Shopify (`@lfd/shopify-admin`) — classes **plain**, câblées par
    // fabrique : le provider de jeton lit ses identifiants via le port étroit
    // (aliasé sur AppConfig) ; le client Admin lit domaine/version via le port
    // `ShopifyStoreSettings`, que `ShopifySettingsService` satisfait (Prisma).
    { provide: SHOPIFY_CREDENTIALS_SOURCE, useExisting: AppConfig },
    {
      provide: ShopifyTokenProvider,
      useFactory: (config: ShopifyCredentialsSource): ShopifyTokenProvider =>
        new ShopifyTokenProvider(config),
      inject: [SHOPIFY_CREDENTIALS_SOURCE],
    },
    {
      provide: ShopifyAdminClient,
      useFactory: (
        settings: ShopifyStoreSettings,
        tokens: ShopifyTokenProvider,
      ): ShopifyAdminClient => new ShopifyAdminClient(settings, tokens),
      inject: [ShopifySettingsService, ShopifyTokenProvider],
    },
    DryRunShopifyCollectionsGateway,
    LiveShopifyCollectionsGateway,
    ShopifyCollectionsService,
    TaxCollectionsPlan,
    ShopifyConnectionService,
  ],
})
export class ShopifyModule {}
