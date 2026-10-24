import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { UpdateCustomerCancellationSettingsHandler } from "./application/commands/update-customer-cancellation-settings.handler.js";
import { GetCustomerCancellationSettingsHandler } from "./application/queries/get-customer-cancellation-settings.handler.js";
import { CustomerCancellationSettingsReader } from "./domain/ports/customer-cancellation-settings.reader.js";
import { CustomerCancellationSettingsRepository } from "./domain/ports/customer-cancellation-settings.repository.js";
import { AdminCustomerCancellationController } from "./http/admin-customer-cancellation.controller.js";
import { PrismaCustomerCancellationSettingsReader } from "./infrastructure/prisma-customer-cancellation-settings.reader.js";
import { PrismaCustomerCancellationSettingsRepository } from "./infrastructure/prisma-customer-cancellation-settings.repository.js";
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
 * 2026-10-09). Doc : `documentation/commandes/passation/ouverture-de-la-boutique.md`.
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` (l'auteur figé du geste).
 * Exporte le port de LECTURE seul : `orders` refuse une passation, il ne pose
 * jamais le réglage.
 *
 * Porte aussi, depuis le lot C6 (C6.5), le réglage « les particuliers peuvent
 * annuler eux-mêmes » : la même nature de réglage, le même écran, le même
 * droit. Même règle d'export : `orders` le lit, il ne le pose pas.
 */
@Module({
  imports: [AccountModule],
  controllers: [
    OrderOpeningController,
    AdminOrderOpeningController,
    AdminCustomerCancellationController,
  ],
  providers: [
    { provide: OrderOpeningReader, useClass: PrismaOrderOpeningReader },
    { provide: OrderOpeningRepository, useClass: PrismaOrderOpeningRepository },
    GetOrderOpeningHandler,
    UpdateOrderOpeningHandler,
    {
      provide: CustomerCancellationSettingsReader,
      useClass: PrismaCustomerCancellationSettingsReader,
    },
    {
      provide: CustomerCancellationSettingsRepository,
      useClass: PrismaCustomerCancellationSettingsRepository,
    },
    GetCustomerCancellationSettingsHandler,
    UpdateCustomerCancellationSettingsHandler,
  ],
  exports: [OrderOpeningReader, CustomerCancellationSettingsReader],
})
export class OrderOpeningModule {}
