import { Module } from "@nestjs/common";

import { PickupAddressesModule } from "../pickup-addresses/pickup-addresses.module.js";
import { ListFulfillmentDaysHandler } from "./application/list-fulfillment-days.handler.js";
import {
  CreateOrderCutoffHandler,
  ListOrderCutoffsHandler,
  RemoveOrderCutoffHandler,
  UpdateOrderCutoffHandler,
} from "./application/order-cutoff.handlers.js";
import { OrderCutoffRepository } from "./domain/order-cutoff.repository.js";
import { AdminOrderCutoffsController } from "./http/admin-order-cutoffs.controller.js";
import { FulfillmentDaysController } from "./http/fulfillment-days.controller.js";
import { PrismaOrderCutoffRepository } from "./infrastructure/prisma-order-cutoff.repository.js";

/**
 * **Heures limites de commande** — jusqu'à quand on commande pour un
 * acheminement donné. Une règle par ligne (point de retrait × jour), la plus
 * spécifique l'emportant.
 *
 * Exporte son repository : le contexte `orders` en aura besoin pour décider
 * si un avenant entre dans la production du jour ou doit passer par la
 * validation de la prod (cf. `architecture-commande-immuable-avenants.md`).
 */
@Module({
  // Les points de retrait pour `GET /fulfillment-days` : la journée se calcule
  // par point, et c'est ce module-ci qui possède les règles qui la décident.
  imports: [PickupAddressesModule],
  controllers: [AdminOrderCutoffsController, FulfillmentDaysController],
  providers: [
    { provide: OrderCutoffRepository, useClass: PrismaOrderCutoffRepository },
    ListFulfillmentDaysHandler,
    ListOrderCutoffsHandler,
    CreateOrderCutoffHandler,
    UpdateOrderCutoffHandler,
    RemoveOrderCutoffHandler,
  ],
  exports: [OrderCutoffRepository],
})
export class OrderCutoffsModule {}
