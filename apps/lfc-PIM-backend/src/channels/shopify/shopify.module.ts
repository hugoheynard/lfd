import { Module } from '@nestjs/common';

import { CatalogueModule } from '../../catalogue/catalogue.module.js';
import { DatabaseModule } from '../../infra/database/database.module.js';
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
  controllers: [ShopifyController],
  providers: [
    ShopifySettingsService,
    ShopifyPushService,
    { provide: ShopifyDriver, useClass: DryRunShopifyDriver },
  ],
})
export class ShopifyModule {}
