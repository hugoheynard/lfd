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
import { AdminOrderOpeningExemptionsController } from "./http/admin-order-opening-exemptions.controller.js";
import { GrantOrderOpeningExemptionHandler } from "./application/commands/grant-order-opening-exemption.handler.js";
import { WithdrawOrderOpeningExemptionHandler } from "./application/commands/withdraw-order-opening-exemption.handler.js";
import { ListOrderOpeningExemptionsHandler } from "./application/queries/list-order-opening-exemptions.handler.js";
import { ActiveOrderOpeningExemptions } from "./domain/ports/active-order-opening-exemptions.reader.js";
import { OrderOpeningExemptionListReader } from "./domain/ports/order-opening-exemption-list.reader.js";
import { OrderOpeningExemptionRepository } from "./domain/ports/order-opening-exemption.repository.js";
import { PrismaActiveOrderOpeningExemptions } from "./infrastructure/prisma-active-order-opening-exemptions.js";
import { PrismaOrderOpeningExemptionListReader } from "./infrastructure/prisma-order-opening-exemption-list.reader.js";
import { PrismaOrderOpeningExemptionRepository } from "./infrastructure/prisma-order-opening-exemption.repository.js";
import { OrderOpeningController } from "./http/order-opening.controller.js";
import { PrismaOrderOpeningReader } from "./infrastructure/prisma-order-opening.reader.js";
import { PrismaOrderOpeningRepository } from "./infrastructure/prisma-order-opening.repository.js";

/**
 * **À qui la boutique prend des commandes** — un réglage global (Hugo,
 * 2026-10-09). Doc : `documentation/commandes/passation/ouverture-de-la-boutique.md`.
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` (l'auteur figé du geste).
 * Exporte le port de LECTURE seul : `orders` refuse une passation, il ne pose
 * jamais le réglage. Même chose, depuis le 2026-10-26, pour les exemptions à
 * la fermeture : `orders` lit les actives, il n'en accorde ni n'en retire.
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
    AdminOrderOpeningExemptionsController,
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
    { provide: ActiveOrderOpeningExemptions, useClass: PrismaActiveOrderOpeningExemptions },
    { provide: OrderOpeningExemptionRepository, useClass: PrismaOrderOpeningExemptionRepository },
    { provide: OrderOpeningExemptionListReader, useClass: PrismaOrderOpeningExemptionListReader },
    GrantOrderOpeningExemptionHandler,
    WithdrawOrderOpeningExemptionHandler,
    ListOrderOpeningExemptionsHandler,
  ],
  exports: [OrderOpeningReader, CustomerCancellationSettingsReader, ActiveOrderOpeningExemptions],
})
export class OrderOpeningModule {}
