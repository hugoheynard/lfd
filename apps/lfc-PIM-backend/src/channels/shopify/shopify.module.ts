import { Module } from '@nestjs/common';

import { CatalogueModule } from '../../catalogue/catalogue.module.js';
import { DatabaseModule } from '../../infra/database/database.module.js';
import { ChannelController } from './channel.controller.js';
import { ShopifyAdminClient } from './shopify-admin-client.js';
import {
  DryRunShopifyCollectionsGateway,
  LiveShopifyCollectionsGateway,
} from './shopify-collections-gateway.js';
import { ShopifyCollectionsService } from './shopify-collections.service.js';
import { ShopifyConnectionService } from './shopify-connection.service.js';
import { DryRunShopifyDriver, ShopifyDriver } from './shopify-driver.js';
import { ShopifyCollectionsController } from './shopify-collections.controller.js';
import { ShopifyPushService } from './shopify-push.service.js';
import { ShopifyProductsController } from './shopify-products.controller.js';
import { ShopifySettingsService } from './shopify-settings.service.js';

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
    { provide: ShopifyDriver, useClass: DryRunShopifyDriver },
    // Collections de TVA : transport réel + les deux passerelles (simulation / réel),
    // le service choisissant selon le mode des réglages.
    ShopifyAdminClient,
    DryRunShopifyCollectionsGateway,
    LiveShopifyCollectionsGateway,
    ShopifyCollectionsService,
    ShopifyConnectionService,
  ],
})
export class ShopifyModule {}
