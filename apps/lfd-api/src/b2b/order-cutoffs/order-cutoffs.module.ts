import { Module } from "@nestjs/common";

import {
  CreateOrderCutoffHandler,
  ListOrderCutoffsHandler,
  RemoveOrderCutoffHandler,
  UpdateOrderCutoffHandler,
} from "./application/order-cutoff.handlers.js";
import { OrderCutoffRepository } from "./domain/order-cutoff.repository.js";
import { AdminOrderCutoffsController } from "./http/admin-order-cutoffs.controller.js";
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
  controllers: [AdminOrderCutoffsController],
  providers: [
    { provide: OrderCutoffRepository, useClass: PrismaOrderCutoffRepository },
    ListOrderCutoffsHandler,
    CreateOrderCutoffHandler,
    UpdateOrderCutoffHandler,
    RemoveOrderCutoffHandler,
  ],
  exports: [OrderCutoffRepository],
})
export class OrderCutoffsModule {}
