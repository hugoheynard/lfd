import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { DeliveryZonesModule } from "../delivery-zones/delivery-zones.module.js";
import { PickupAddressesModule } from "../pickup-addresses/pickup-addresses.module.js";
import { PriceGridContexts } from "./application/price-grid-context.js";
import { PriceGridPromotions } from "./application/price-grid-promotions.js";
import { ExportPriceGridHandler } from "./application/queries/export-price-grid.handler.js";
import { ListPriceGridPromotionsHandler } from "./application/queries/list-price-grid-promotions.handler.js";
import { PricedCompanyNamer } from "./domain/ports/priced-company-namer.js";
import { PriceGridFulfillmentNamer } from "./domain/ports/price-grid-fulfillment.namer.js";
import { PriceGridViewerReader } from "./domain/ports/price-grid-viewer.reader.js";
import { PriceGridShelfReader } from "./domain/ports/price-grid-shelf.reader.js";
import { AdminPriceGridController } from "./http/admin-price-grid.controller.js";
import { CatalogPriceGridViewerReader } from "./infrastructure/catalog-price-grid-viewer.reader.js";
import { CatalogPriceGridShelfReader } from "./infrastructure/catalog-price-grid-shelf.reader.js";
import { PrismaPricedCompanyNamer } from "./infrastructure/prisma-priced-company-namer.js";
import { RepositoryPriceGridFulfillmentNamer } from "./infrastructure/price-grid-fulfillment.namer.js";
import { PricerModule } from "./pricer.module.js";
import { PricingModule } from "./pricing.module.js";

/**
 * **La grille de prix d'un public** (`plan-export-grille-de-prix.md`) — une
 * lecture, et rien d'autre : aucun dépôt d'écriture n'y est fourni.
 *
 * Un module à part plutôt qu'une ligne de plus dans `PricingAdminModule` : la
 * grille lit le rayon (catalogue), les points de retrait et les zones, que le
 * paramétrage n'a aucune raison de connaître.
 */
@Module({
  imports: [CatalogModule, PricingModule, PricerModule, PickupAddressesModule, DeliveryZonesModule],
  controllers: [AdminPriceGridController],
  providers: [
    PriceGridContexts,
    PriceGridPromotions,
    ListPriceGridPromotionsHandler,
    ExportPriceGridHandler,
    { provide: PriceGridShelfReader, useClass: CatalogPriceGridShelfReader },
    { provide: PriceGridViewerReader, useClass: CatalogPriceGridViewerReader },
    { provide: PriceGridFulfillmentNamer, useClass: RepositoryPriceGridFulfillmentNamer },
    { provide: PricedCompanyNamer, useClass: PrismaPricedCompanyNamer },
  ],
})
export class PriceGridModule {}
