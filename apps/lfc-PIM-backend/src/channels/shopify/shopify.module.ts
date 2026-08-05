import { Module } from '@nestjs/common';

import { CatalogueModule } from '../../catalogue/catalogue.module.js';
import { DatabaseModule } from '../../infra/database/database.module.js';
import { ShopifyCollectionsController } from './collections/collections.controller.js';
import { ShopifyCollectionsService } from './collections/collections.service.js';
import {
  DryRunShopifyCollectionsGateway,
  LiveShopifyCollectionsGateway,
} from './collections/gateway.js';
import { ChannelController } from './connection/channel.controller.js';
import { ShopifyConnectionService } from './connection/connection.service.js';
import { DryRunShopifyDriver, LiveShopifyDriver } from './products/driver.js';
import { ShopifyInspectionService } from './products/inspection.service.js';
import { ShopifyProductsController } from './products/products.controller.js';
import { ShopifyPushService } from './products/push.service.js';
import { AppConfig } from '../../infra/config/app-config.js';
import { ShopifyAdminClient } from './shared/admin-client.js';
import { ShopifySettingsService } from './shared/settings.service.js';
import {
  SHOPIFY_CREDENTIALS_SOURCE,
  ShopifyTokenProvider,
} from './shared/token-provider.js';

/**
 * Adaptateur de canal — il **dépend** du catalogue, jamais l'inverse.
 *
 * Il n'importe pas les dépôts du catalogue mais son `CatalogueReader`, seul contrat
 * exporté (ADR-13). Supprimer ce module ne casserait rien en amont.
 */
@Module({
  imports: [DatabaseModule, CatalogueModule],
  // Un contrôleur par thématique, sous le préfixe module `channels/shopify`
  // (monté par `RouterModule` dans `AppModule` — un module ne pouvant pas se
  // référencer lui-même dans `RouterModule.register`) :
  //   ChannelController            → settings + verify (connexion au canal)
  //   ShopifyCollectionsController → collections/tva (inspect + push)
  //   ShopifyProductsController    → products (bindings + push)
  controllers: [
    ChannelController,
    ShopifyCollectionsController,
    ShopifyProductsController,
  ],
  providers: [
    ShopifySettingsService,
    ShopifyPushService,
    ShopifyInspectionService,
    // Les deux pilotes de push, concrets : le service choisit selon le mode des réglages.
    DryRunShopifyDriver,
    LiveShopifyDriver,
    // Collections de TVA : transport réel + les deux passerelles (simulation / réel),
    // le service choisissant selon le mode des réglages.
    // Le provider de jeton lit ses identifiants via le port étroit, aliasé sur AppConfig.
    { provide: SHOPIFY_CREDENTIALS_SOURCE, useExisting: AppConfig },
    ShopifyTokenProvider,
    ShopifyAdminClient,
    DryRunShopifyCollectionsGateway,
    LiveShopifyCollectionsGateway,
    ShopifyCollectionsService,
    ShopifyConnectionService,
  ],
})
export class ShopifyModule {}
