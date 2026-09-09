import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { DeliveryZonesModule } from "../delivery-zones/delivery-zones.module.js";
import { OrderCutoffRepository } from "../order-cutoffs/domain/order-cutoff.repository.js";
import { OrderCutoffsModule } from "../order-cutoffs/order-cutoffs.module.js";
import { OrderWaiversModule } from "../order-waivers/order-waivers.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PricerModule } from "../pricing/pricer.module.js";
import { PickupAddressesModule } from "../pickup-addresses/pickup-addresses.module.js";
import { MarkOrderFulfilledHandler } from "./application/commands/mark-order-fulfilled.handler.js";
import { MarkOrderReadyHandler } from "./application/commands/mark-order-ready.handler.js";
import { SendOrderPlacedMail } from "./application/handlers/send-order-placed-mail.handler.js";
import { SendOrderReadyMail } from "./application/handlers/send-order-ready-mail.handler.js";
import { AppConfig } from "../../platform/config/app-config.js";
import { OrderMailOrigins } from "./domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "./domain/ports/order-recipient.reader.js";
import { PrismaOrderRecipientReader } from "./infrastructure/prisma-order-recipient.reader.js";
import { ConfirmOrderPaymentHandler } from "./application/commands/confirm-order-payment.handler.js";
import { DiscardOrderDraftHandler } from "./application/commands/discard-order-draft.handler.js";
import { PlaceOrderForCustomerHandler } from "./application/commands/place-order-for-customer.handler.js";
import { SaveOrderDraftHandler } from "./application/commands/save-order-draft.handler.js";
import { SaveShopCartHandler } from "./application/commands/save-shop-cart.handler.js";
import { PlaceOrderHandler } from "./application/commands/place-order.handler.js";
import { QuoteOrderHandler } from "./application/queries/quote-order.handler.js";
import { QuoteShopCartHandler } from "./application/queries/quote-shop-cart.handler.js";
import { CartAdjustments } from "./application/services/cart-adjustments.service.js";
import { ShopCartController } from "./http/shop-cart.controller.js";
import { ShopQuoteController } from "./http/shop-quote.controller.js";
import { OrderDrafting } from "./application/services/order-drafting.service.js";
import { OrderLinePricing } from "./application/services/order-line-pricing.service.js";
import { GetAdminOrderHandler } from "./application/queries/get-admin-order.handler.js";
import { GetOrderDraftHandler } from "./application/queries/get-order-draft.handler.js";
import { GetShopCartHandler } from "./application/queries/get-shop-cart.handler.js";
import { ListCatalogHandler } from "./application/queries/list-catalog.handler.js";
import { ListCustomerSkusHandler } from "./application/queries/list-customer-skus.handler.js";
import { GetPackingHandler } from "./application/queries/get-packing.handler.js";
import { GetOrderPaymentHandler } from "./application/queries/get-order-payment.handler.js";
import { GetOrderHandler } from "./application/queries/get-order.handler.js";
import { GetOrderSheetHandler } from "./application/queries/get-order-sheet.handler.js";
import { GetAdminOrderSheetPdfHandler } from "./application/queries/get-admin-order-sheet-pdf.handler.js";
import { GetOrderSheetPdfHandler } from "./application/queries/get-order-sheet-pdf.handler.js";
import { OrderSheetArchive } from "./application/services/order-sheet-archive.service.js";
import { OnProductionDayClosed } from "./application/handlers/on-production-day-closed.handler.js";
import { OnOrderHandedOver } from "./application/handlers/on-order-handed-over.handler.js";
import { OnOrderPacked } from "./application/handlers/on-order-packed.handler.js";
import { PrismaDayOrdersReader } from "./infrastructure/prisma-day-orders.reader.js";
import { PrismaHandoverSubjectReader } from "./infrastructure/prisma-handover-subject.reader.js";
import { PrismaPendingOrdersReader } from "./infrastructure/prisma-pending-orders.reader.js";
import { GetProductionBatchHandler } from "./application/queries/get-production-batch.handler.js";
import { ListAdminOrdersHandler } from "./application/queries/list-admin-orders.handler.js";
import { ListCompanyOrdersHandler } from "./application/queries/list-company-orders.handler.js";
import { ListPersonalOrdersHandler } from "./application/queries/list-personal-orders.handler.js";
import { CustomerSkuReader } from "./domain/ports/customer-sku.reader.js";
import { OrderCutoffReader } from "./domain/ports/order-cutoff.reader.js";
import { OrderGuardReader } from "./domain/ports/order-guard.reader.js";
import { OrderReader } from "./domain/ports/order.reader.js";
import { OrderDraftRepository } from "./domain/ports/order-draft.repository.js";
import { ShopCartRepository } from "./domain/ports/shop-cart.repository.js";
import { OrderIdempotencyStore } from "./domain/ports/order-idempotency.store.js";
import { OrderRepository } from "./domain/ports/order.repository.js";
import { PrismaCustomerSkuReader } from "./infrastructure/prisma-customer-sku.reader.js";
import { PrismaOrderGuardReader } from "./infrastructure/prisma-order-guard.reader.js";
import { PrismaOrderDraftRepository } from "./infrastructure/prisma-order-draft.repository.js";
import { PrismaShopCartRepository } from "./infrastructure/prisma-shop-cart.repository.js";
import { PrismaOrderReader } from "./infrastructure/prisma-order.reader.js";
import { PrismaOrderIdempotencyStore } from "./infrastructure/prisma-order-idempotency.store.js";
import { PrismaOrderRepository } from "./infrastructure/prisma-order.repository.js";
import { CompanyOrdersController } from "./http/company-orders.controller.js";
import { AdminCatalogController } from "./http/admin-catalog.controller.js";
import { AdminOrderDraftsController } from "./http/admin-order-drafts.controller.js";
import { DeliveryDefaultsReader } from "./domain/ports/delivery-defaults.reader.js";
import { PrismaDeliveryDefaultsReader } from "./infrastructure/prisma-delivery-defaults.reader.js";
import { AdminOrdersController } from "./http/admin-orders.controller.js";
import { AdminProductionController } from "./http/admin-production.controller.js";
import { OrdersController } from "./http/orders.controller.js";
import { MyShopCatalogueController } from "./http/my-shop-catalogue.controller.js";
import { MyShopQuoteController } from "./http/my-shop-quote.controller.js";
import { ReadMyShopCatalogueHandler } from "./application/queries/read-my-shop-catalogue.js";

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
    OrderCutoffsModule,
    OrderWaiversModule,
    PaymentsModule,
    CatalogModule,
    // La caisse passe par LA porte du prix depuis le 2026-09-09, plus par le
    // chargeur : elle avait sa propre chorégraphie, comme les trois autres
    // appelants, et c'est ainsi que deux d'entre eux ont oublié un étage.
    PricerModule,
  ],
  controllers: [
    OrdersController,
    MyShopCatalogueController,
    MyShopQuoteController,
    CompanyOrdersController,
    AdminOrdersController,
    AdminProductionController,
    AdminOrderDraftsController,
    AdminCatalogController,
    // La seule surface PUBLIQUE de ce contexte. Rangée avec les autres parce
    // qu'elle tarife un panier — c'est un sujet de commande, pas de catalogue —
    // et son absence de jeton est écrite dans son en-tête, pas dans sa place.
    ShopQuoteController,
    // Murée, elle : un panier a un propriétaire. Rangée près de la vitrine
    // parce qu'elle sert le même écran, pas parce qu'elle a le même public.
    ShopCartController,
  ],
  providers: [
    OrderDrafting,
    OrderLinePricing,
    CartAdjustments,
    PlaceOrderHandler,
    PlaceOrderForCustomerHandler,
    ConfirmOrderPaymentHandler,
    ListCompanyOrdersHandler,
    ListPersonalOrdersHandler,
    GetOrderHandler,
    GetOrderSheetHandler,
    GetOrderSheetPdfHandler,
    GetAdminOrderSheetPdfHandler,
    OrderSheetArchive,
    GetOrderPaymentHandler,
    GetAdminOrderHandler,
    { provide: DeliveryDefaultsReader, useClass: PrismaDeliveryDefaultsReader },
    PrismaDayOrdersReader,
    PrismaHandoverSubjectReader,
    PrismaPendingOrdersReader,
    OnProductionDayClosed,
    OnOrderPacked,
    OnOrderHandedOver,
    GetProductionBatchHandler,
    GetPackingHandler,
    SendOrderPlacedMail,
    SendOrderReadyMail,
    { provide: OrderRecipientReader, useClass: PrismaOrderRecipientReader },
    {
      // Les deux origines, extraites de la configuration à la racine de
      // composition. L'abonné dépend du port étroit, pas des trente lectures
      // d'`AppConfig` dont il n'appelle que deux.
      provide: OrderMailOrigins,
      inject: [AppConfig],
      useFactory: (config: AppConfig): OrderMailOrigins => ({
        clientBaseUrl: () => config.clientBaseUrl(),
        adminBaseUrl: () => config.adminBaseUrl(),
      }),
    },
    MarkOrderReadyHandler,
    MarkOrderFulfilledHandler,
    ListAdminOrdersHandler,
    ListCatalogHandler,
    ListCustomerSkusHandler,
    QuoteOrderHandler,
    ReadMyShopCatalogueHandler,
    QuoteShopCartHandler,
    GetOrderDraftHandler,
    SaveOrderDraftHandler,
    DiscardOrderDraftHandler,
    GetShopCartHandler,
    SaveShopCartHandler,
    // `useExisting` et non `useClass` : une SEULE instance lit la table des
    // règles. Le contexte `orders` n'en voit que `list()` — le port étroit —
    // pendant que les réglages gardent le repository complet. Deux instances
    // n'auraient rien cassé aujourd'hui, mais auraient rendu légitime, demain,
    // d'ajouter un cache à l'une et pas à l'autre.
    { provide: OrderCutoffReader, useExisting: OrderCutoffRepository },
    { provide: OrderGuardReader, useClass: PrismaOrderGuardReader },
    { provide: CustomerSkuReader, useClass: PrismaCustomerSkuReader },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    // Le registre des clés de passation : un double clic ne fait qu'une commande.
    { provide: OrderIdempotencyStore, useClass: PrismaOrderIdempotencyStore },
    { provide: OrderDraftRepository, useClass: PrismaOrderDraftRepository },
    { provide: ShopCartRepository, useClass: PrismaShopCartRepository },
    { provide: OrderReader, useClass: PrismaOrderReader },
  ],
  // Le catalogue sort d'ici parce que l'écran de tarification en a besoin : il
  // doit résoudre les prix contre l'autorité que la caisse utilise, pas contre
  // une seconde copie. Cf. `PricingAdminModule`.
  exports: [
    // Les trois adaptateurs que la production consomme par ses ports. Ils
    // sortent d'ici pour être RELIÉS dans la racine de composition, jamais
    // pour être importés par le fournil : le token qu'il connaît est le sien.
    PrismaDayOrdersReader,
    PrismaHandoverSubjectReader,
    PrismaPendingOrdersReader,
    // Et le port de lecture des commandes, dont le troisième dépend : il
    // DÉLÈGUE la lecture du sujet de remise plutôt que de recopier son `select`,
    // et Nest doit pouvoir le lui donner là où il est instancié.
    OrderReader,
  ],
})
export class OrdersModule {}
