import { Global, Module } from "@nestjs/common";

import { AccountModule } from "../lafoliecoffee/account/account.module.js";
import { AccountBasketBuyerContacts } from "../lafoliecoffee/account/infrastructure/account-basket-buyer-contacts.js";
import { AccountBasketBuyerStanding } from "../lafoliecoffee/account/infrastructure/account-basket-buyer-standing.js";
import { CatalogBasketArticles } from "../lafoliecoffee/catalog/application/catalog-basket-articles.js";
import { CatalogModule } from "../lafoliecoffee/catalog/catalog.module.js";
import { OrdersBasketSalesTerms } from "../lafoliecoffee/orders/application/services/orders-basket-sales-terms.js";
import { RecurringOccurrencePlacement } from "../lafoliecoffee/orders/application/services/recurring-occurrence-placement.js";
import { OrdersModule } from "../lafoliecoffee/orders/orders.module.js";
import { SiteBasketPickupPoints } from "../lafoliecoffee/pickup-addresses/infrastructure/site-basket-pickup-points.js";
import { PickupAddressesModule } from "../lafoliecoffee/pickup-addresses/pickup-addresses.module.js";
import {
  BasketArticles,
  BasketBuyerContacts,
  BasketBuyerStanding,
  BasketPickupPoints,
  BasketSalesTerms,
  OccurrencePlacement,
} from "../recurring/channels/commerce/index.js";

/**
 * **Le fil des paniers récurrents, relié** (plan `plan-bloc-recurrent.md`,
 * § 6.1) : les ports que `recurring/channels/commerce/` déclare, branchés sur
 * leurs implémentations du commerce — la passation d'une échéance et les CGV
 * (`orders`), l'acheteur et son adresse (`account`), les articles (`catalog`), les points de
 * retrait (`pickup-addresses`).
 *
 * `@Global` pour la raison des autres fils : `recurring` ne peut pas importer
 * le commerce, et le commerce n'importe de lui que son canal.
 */
@Global()
@Module({
  imports: [OrdersModule, AccountModule, CatalogModule, PickupAddressesModule],
  providers: [
    { provide: OccurrencePlacement, useExisting: RecurringOccurrencePlacement },
    { provide: BasketSalesTerms, useExisting: OrdersBasketSalesTerms },
    { provide: BasketBuyerStanding, useClass: AccountBasketBuyerStanding },
    { provide: BasketBuyerContacts, useClass: AccountBasketBuyerContacts },
    { provide: BasketArticles, useClass: CatalogBasketArticles },
    { provide: BasketPickupPoints, useClass: SiteBasketPickupPoints },
  ],
  exports: [
    OccurrencePlacement,
    BasketSalesTerms,
    BasketBuyerStanding,
    BasketBuyerContacts,
    BasketArticles,
    BasketPickupPoints,
  ],
})
export class RecurringFeedModule {}
