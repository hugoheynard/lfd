import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { PickupAddressesModule } from "../pickup-addresses/pickup-addresses.module.js";
import { GetOrderCutoffSettingsHandler } from "./application/get-order-cutoff-settings.handler.js";
import { ListFulfillmentDaysHandler } from "./application/list-fulfillment-days.handler.js";
import { UpdateOrderCutoffSettingsHandler } from "./application/update-order-cutoff-settings.handler.js";
import { DefineGeneralOrderCutoffHandler } from "./application/define-general-order-cutoff.handler.js";
import { GetGeneralOrderCutoffHandler } from "./application/get-general-order-cutoff.handler.js";
import { GeneralOrderCutoffRepository } from "./domain/general-order-cutoff.repository.js";
import { OrderCutoffSettingsRepository } from "./domain/order-cutoff-settings.repository.js";
import { OrderCutoffsInForceModule } from "./order-cutoffs-in-force.module.js";
import { AdminOrderCutoffSettingsController } from "./http/admin-order-cutoff-settings.controller.js";
import { AdminOrderCutoffsController } from "./http/admin-order-cutoffs.controller.js";
import { FulfillmentDaysController } from "./http/fulfillment-days.controller.js";
import { PrismaGeneralOrderCutoffRepository } from "./infrastructure/prisma-general-order-cutoff.repository.js";
import { PrismaOrderCutoffSettingsRepository } from "./infrastructure/prisma-order-cutoff-settings.repository.js";

/**
 * **Heures limites de commande** — jusqu'à quand on commande pour un
 * acheminement donné. Une seule règle, la générale, depuis le 2026-10-21
 * (`limites-de-commande/schema-des-reglages.md` §4, point 4).
 *
 * Exporte `OrderCutoffsInForce` (lot O3, 2026-10-14) : les règles telles
 * que l'interrupteur de l'heure limite générale les laisse s'appliquer. C'est
 * lui que la passation, la relance et le fournil lisent ; `StoredOrderCutoffReader`
 * reste la lecture de l'écran, qui montre une règle même endormie. `AccountModule`
 * pour le seul `StaffDirectory` (l'auteur figé de la bascule).
 */
@Module({
  // Les points de retrait pour `GET /fulfillment-days` : la journée se calcule
  // par point, et c'est ce module-ci qui possède les règles qui la décident.
  // Le catalogue, pour les jours d'une opération datée (`SaleOperations`).
  imports: [PickupAddressesModule, CatalogModule, AccountModule, OrderCutoffsInForceModule],
  controllers: [
    AdminOrderCutoffsController,
    AdminOrderCutoffSettingsController,
    FulfillmentDaysController,
  ],
  providers: [
    ListFulfillmentDaysHandler,
    GetGeneralOrderCutoffHandler,
    DefineGeneralOrderCutoffHandler,
    { provide: GeneralOrderCutoffRepository, useClass: PrismaGeneralOrderCutoffRepository },
    { provide: OrderCutoffSettingsRepository, useClass: PrismaOrderCutoffSettingsRepository },
    GetOrderCutoffSettingsHandler,
    UpdateOrderCutoffSettingsHandler,
  ],
  // Les règles en vigueur vivent dans leur module (cf. `OrderCutoffsInForceModule`) ;
  // réexportées pour que les lecteurs d'avant n'aient rien à changer.
  exports: [OrderCutoffsInForceModule],
})
export class OrderCutoffsModule {}
