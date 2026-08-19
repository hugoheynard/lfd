import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { DeliveryZonesModule } from "../delivery-zones/delivery-zones.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PricingModule } from "../pricing/pricing.module.js";
import { PickupAddressesModule } from "../pickup-addresses/pickup-addresses.module.js";
import { ConfirmHandoverHandler } from "./application/commands/confirm-handover.handler.js";
import { ConfirmOrderPaymentHandler } from "./application/commands/confirm-order-payment.handler.js";
import { DiscardOrderDraftHandler } from "./application/commands/discard-order-draft.handler.js";
import { PlaceOrderForCustomerHandler } from "./application/commands/place-order-for-customer.handler.js";
import { SaveOrderDraftHandler } from "./application/commands/save-order-draft.handler.js";
import { PlaceOrderHandler } from "./application/commands/place-order.handler.js";
import { QuoteOrderHandler } from "./application/queries/quote-order.handler.js";
import { OrderDrafting } from "./application/services/order-drafting.service.js";
import { OrderLinePricing } from "./application/services/order-line-pricing.service.js";
import { GetAdminOrderHandler } from "./application/queries/get-admin-order.handler.js";
import { GetOrderDraftHandler } from "./application/queries/get-order-draft.handler.js";
import { ListCatalogHandler } from "./application/queries/list-catalog.handler.js";
import { ListCustomerSkusHandler } from "./application/queries/list-customer-skus.handler.js";
import { GetHandoverHandler } from "./application/queries/get-handover.handler.js";
import { GetOrderPaymentHandler } from "./application/queries/get-order-payment.handler.js";
import { GetOrderHandler } from "./application/queries/get-order.handler.js";
import { GetProductionBatchHandler } from "./application/queries/get-production-batch.handler.js";
import { ListAdminOrdersHandler } from "./application/queries/list-admin-orders.handler.js";
import { ListCompanyOrdersHandler } from "./application/queries/list-company-orders.handler.js";
import { ListPersonalOrdersHandler } from "./application/queries/list-personal-orders.handler.js";
import { CustomerSkuReader } from "./domain/ports/customer-sku.reader.js";
import { OrderGuardReader } from "./domain/ports/order-guard.reader.js";
import { OrderReader } from "./domain/ports/order.reader.js";
import { OrderDraftRepository } from "./domain/ports/order-draft.repository.js";
import { OrderRepository } from "./domain/ports/order.repository.js";
import { ProductCatalogReader } from "./domain/ports/product-catalog.reader.js";
import { PrismaCustomerSkuReader } from "./infrastructure/prisma-customer-sku.reader.js";
import { PrismaOrderGuardReader } from "./infrastructure/prisma-order-guard.reader.js";
import { PrismaOrderDraftRepository } from "./infrastructure/prisma-order-draft.repository.js";
import { PrismaOrderReader } from "./infrastructure/prisma-order.reader.js";
import { PrismaOrderRepository } from "./infrastructure/prisma-order.repository.js";
import { CatalogBackedProductCatalog } from "./infrastructure/catalog-backed-product-catalog.js";
import { CompanyOrdersController } from "./http/company-orders.controller.js";
import { AdminHandoverController } from "./http/admin-handover.controller.js";
import { AdminCatalogController } from "./http/admin-catalog.controller.js";
import { AdminOrderDraftsController } from "./http/admin-order-drafts.controller.js";
import { DeliveryDefaultsReader } from "./domain/ports/delivery-defaults.reader.js";
import { PrismaDeliveryDefaultsReader } from "./infrastructure/prisma-delivery-defaults.reader.js";
import { AdminOrdersController } from "./http/admin-orders.controller.js";
import { AdminProductionController } from "./http/admin-production.controller.js";
import { OrdersController } from "./http/orders.controller.js";

/**
 * Contexte **commandes** : le checkout (panier → `Order` en Postgres) et la
 * liste des commandes d'une entreprise.
 *
 * Autonome : il lit ses garde-fous (rôle + statut d'entreprise) via son propre
 * port plutôt que de dépendre des internes du contexte `account`. Les prix sont
 * résolus par un catalogue semé (jetable jusqu'au sync PIM).
 *
 * Importe `CatalogModule` pour une seule raison, et **temporaire** : le
 * contrôleur de parité compare l'autorité de prix en place au catalogue reçu.
 * Les deux disparaissent ensemble à la bascule.
 */
@Module({
  imports: [
    PickupAddressesModule,
    DeliveryZonesModule,
    PaymentsModule,
    CatalogModule,
    PricingModule,
  ],
  controllers: [
    OrdersController,
    CompanyOrdersController,
    AdminOrdersController,
    AdminProductionController,
    AdminOrderDraftsController,
    AdminCatalogController,
    AdminHandoverController,
  ],
  providers: [
    OrderDrafting,
    OrderLinePricing,
    PlaceOrderHandler,
    PlaceOrderForCustomerHandler,
    ConfirmOrderPaymentHandler,
    ListCompanyOrdersHandler,
    ListPersonalOrdersHandler,
    GetOrderHandler,
    GetOrderPaymentHandler,
    GetAdminOrderHandler,
    { provide: DeliveryDefaultsReader, useClass: PrismaDeliveryDefaultsReader },
    GetProductionBatchHandler,
    ListAdminOrdersHandler,
    ListCatalogHandler,
    ListCustomerSkusHandler,
    QuoteOrderHandler,
    GetHandoverHandler,
    ConfirmHandoverHandler,
    GetOrderDraftHandler,
    SaveOrderDraftHandler,
    DiscardOrderDraftHandler,
    { provide: OrderGuardReader, useClass: PrismaOrderGuardReader },
    { provide: CustomerSkuReader, useClass: PrismaCustomerSkuReader },
    { provide: ProductCatalogReader, useClass: CatalogBackedProductCatalog },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: OrderDraftRepository, useClass: PrismaOrderDraftRepository },
    { provide: OrderReader, useClass: PrismaOrderReader },
  ],
  // Le catalogue sort d'ici parce que l'écran de tarification en a besoin : il
  // doit résoudre les prix contre l'autorité que la caisse utilise, pas contre
  // une seconde copie. Cf. `PricingAdminModule`.
  exports: [ProductCatalogReader],
})
export class OrdersModule {}
