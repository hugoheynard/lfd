import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { UpdateOrderOpeningHandler } from "./application/commands/update-order-opening.handler.js";
import { GetOrderOpeningHandler } from "./application/queries/get-order-opening.handler.js";
import { OrderOpeningReader } from "./domain/ports/order-opening.reader.js";
import { OrderOpeningRepository } from "./domain/ports/order-opening.repository.js";
import { AdminOrderOpeningController } from "./http/admin-order-opening.controller.js";
import { OrderOpeningController } from "./http/order-opening.controller.js";
import { PrismaOrderOpeningReader } from "./infrastructure/prisma-order-opening.reader.js";
import { PrismaOrderOpeningRepository } from "./infrastructure/prisma-order-opening.repository.js";

/**
 * **À qui la boutique prend des commandes** — un réglage global (Hugo,
 * 2026-10-09). Doc : `documentation/order/ouverture-de-la-boutique.md`.
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` (l'auteur figé du geste).
 * Exporte le port de LECTURE seul : `orders` refuse une passation, il ne pose
 * jamais le réglage.
 */
@Module({
  imports: [AccountModule],
  controllers: [OrderOpeningController, AdminOrderOpeningController],
  providers: [
    { provide: OrderOpeningReader, useClass: PrismaOrderOpeningReader },
    { provide: OrderOpeningRepository, useClass: PrismaOrderOpeningRepository },
    GetOrderOpeningHandler,
    UpdateOrderOpeningHandler,
  ],
  exports: [OrderOpeningReader],
})
export class OrderOpeningModule {}
