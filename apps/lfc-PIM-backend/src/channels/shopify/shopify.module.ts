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
import { ShopifyPushService } from './shopify-push.service.js';
import { ShopifySettingsService } from './shopify-settings.service.js';
import { ShopifyController } from './shopify.controller.js';

/**
 * Adaptateur de canal — il **dépend** du catalogue, jamais l'inverse.
 *
 * Il n'importe pas les dépôts du catalogue mais son `CatalogueReader`, seul contrat
 * exporté (ADR-13). Supprimer ce module ne casserait rien en amont.
 */
@Module({
  imports: [DatabaseModule, CatalogueModule],
  // Deux surfaces HTTP : la connexion au canal ({@link ChannelController}) et les
  // ressources Shopify ({@link ShopifyController}). Leur préfixe commun
  // `channels/shopify` est monté par `RouterModule` dans `AppModule` (un module
  // ne pouvant pas se référencer lui-même dans `RouterModule.register`).
  controllers: [ChannelController, ShopifyController],
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
