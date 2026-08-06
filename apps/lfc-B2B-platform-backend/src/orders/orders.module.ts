import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { DeliveryZonesModule } from "../delivery-zones/delivery-zones.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PickupAddressesModule } from "../pickup-addresses/pickup-addresses.module.js";
import { ConfirmOrderPaymentHandler } from "./application/commands/confirm-order-payment.handler.js";
import { PlaceOrderHandler } from "./application/commands/place-order.handler.js";
import { ListCompanyOrdersHandler } from "./application/queries/list-company-orders.handler.js";
import { ListPersonalOrdersHandler } from "./application/queries/list-personal-orders.handler.js";
import { OrderGuardReader } from "./domain/ports/order-guard.reader.js";
import { OrderReader } from "./domain/ports/order.reader.js";
import { OrderRepository } from "./domain/ports/order.repository.js";
import { ProductCatalogReader } from "./domain/ports/product-catalog.reader.js";
import { PrismaOrderGuardReader } from "./infrastructure/prisma-order-guard.reader.js";
import { PrismaOrderReader } from "./infrastructure/prisma-order.reader.js";
import { PrismaOrderRepository } from "./infrastructure/prisma-order.repository.js";
import { SeededProductCatalog } from "./infrastructure/seeded-product-catalog.js";
import { CompanyOrdersController } from "./http/company-orders.controller.js";
import { OrdersController } from "./http/orders.controller.js";

/**
 * Contexte **commandes** : le checkout (panier → `Order` en Postgres) et la
 * liste des commandes d'une entreprise.
 *
 * Autonome : il lit ses garde-fous (rôle + statut d'entreprise) via son propre
 * port plutôt que de dépendre des internes du contexte `account`. Les prix sont
 * résolus par un catalogue semé (jetable jusqu'au sync PIM).
 */
@Module({
  imports: [CqrsModule, PickupAddressesModule, DeliveryZonesModule, PaymentsModule],
  controllers: [OrdersController, CompanyOrdersController],
  providers: [
    PlaceOrderHandler,
    ConfirmOrderPaymentHandler,
    ListCompanyOrdersHandler,
    ListPersonalOrdersHandler,
    { provide: OrderGuardReader, useClass: PrismaOrderGuardReader },
    { provide: ProductCatalogReader, useClass: SeededProductCatalog },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: OrderReader, useClass: PrismaOrderReader },
  ],
})
export class OrdersModule {}
