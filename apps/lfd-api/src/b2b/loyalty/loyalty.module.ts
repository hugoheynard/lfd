import { Module } from "@nestjs/common";

import { AdjustLoyaltyPointsHandler } from "./application/commands/adjust-loyalty-points.handler.js";
import { CancelLoyaltyVoucherHandler } from "./application/commands/cancel-loyalty-voucher.handler.js";
import { CreditOrderPointsHandler } from "./application/commands/credit-order-points.handler.js";
import { CreditPendingOrderPointsHandler } from "./application/commands/credit-pending-order-points.handler.js";
import { ConvertLoyaltyPointsHandler } from "./application/commands/convert-loyalty-points.handler.js";
import { ExpireLoyaltyVouchersHandler } from "./application/commands/expire-loyalty-vouchers.handler.js";
import { SetLoyaltySettingsHandler } from "./application/commands/set-loyalty-settings.handler.js";
import { CreditPointsOnHandover } from "./application/handlers/credit-points-on-handover.handler.js";
import { CreditPointsOnPaymentSettled } from "./application/handlers/credit-points-on-payment-settled.handler.js";
import { GetLoyaltySettingsHandler } from "./application/queries/get-loyalty-settings.handler.js";
import { ListLoyaltyBalancesHandler } from "./application/queries/list-loyalty-balances.handler.js";
import { ListLoyaltyVouchersHandler } from "./application/queries/list-loyalty-vouchers.handler.js";
import { OrderPointsCrediting } from "./application/services/order-points-crediting.js";
import { LoyaltyAccountRepository } from "./domain/ports/loyalty-account.repository.js";
import { LoyaltyEarnedOrdersReader } from "./domain/ports/loyalty-earned-orders.reader.js";
import { LoyaltyConversionGate } from "./domain/ports/loyalty-conversion.gate.js";
import { LoyaltyHolderDirectory } from "./domain/ports/loyalty-holder.directory.js";
import { LoyaltyLedgerReader } from "./domain/ports/loyalty-ledger.reader.js";
import {
  LoyaltySettingsReader,
  LoyaltySettingsWriter,
} from "./domain/ports/loyalty-settings.store.js";
import { LoyaltyVoucherRepository } from "./domain/ports/loyalty-voucher.repository.js";
import { OrdersModule } from "../orders/orders.module.js";
import { AdminLoyaltyController } from "./http/admin-loyalty.controller.js";
import { LoyaltySweepController } from "./http/loyalty-sweep.controller.js";
import { PrismaLoyaltyAccountRepository } from "./infrastructure/prisma-loyalty-account.repository.js";
import { PrismaLoyaltyConversionGate } from "./infrastructure/prisma-loyalty-conversion.gate.js";
import { PrismaLoyaltyEarnedOrdersReader } from "./infrastructure/prisma-loyalty-earned-orders.reader.js";
import { PrismaLoyaltyHolderDirectory } from "./infrastructure/prisma-loyalty-holder.directory.js";
import { PrismaLoyaltyLedgerReader } from "./infrastructure/prisma-loyalty-ledger.reader.js";
import { PrismaLoyaltySettingsStore } from "./infrastructure/prisma-loyalty-settings.store.js";
import { PrismaLoyaltyVoucherRepository } from "./infrastructure/prisma-loyalty-voucher.repository.js";

/**
 * Contexte **fidélité** : le grand livre de points, les bons d'achat, le
 * réglage du ratio (plan `documentation/comptabilite/plan-points-de-fidelite.md`).
 *
 * Programme livré FERMÉ : tant que la comptabilité n'a pas enregistré de
 * réglage, aucune conversion ne passe et aucune commande ne crédite. La route
 * de conversion côté client (lot E1) n'est pas encore bâtie ; la conversion
 * existe ici comme cas d'usage sur le bus.
 *
 * Le crédit des commandes (lot D) lit les commandes définitives par le port
 * que `orders` exporte (`CompletedOrderReader`) — d'où l'import de son module,
 * dans ce sens seulement : `orders` ne connaît pas la fidélité.
 */
@Module({
  imports: [OrdersModule],
  controllers: [AdminLoyaltyController, LoyaltySweepController],
  providers: [
    PrismaLoyaltySettingsStore,
    { provide: LoyaltySettingsReader, useExisting: PrismaLoyaltySettingsStore },
    { provide: LoyaltySettingsWriter, useExisting: PrismaLoyaltySettingsStore },
    { provide: LoyaltyAccountRepository, useClass: PrismaLoyaltyAccountRepository },
    { provide: LoyaltyVoucherRepository, useClass: PrismaLoyaltyVoucherRepository },
    { provide: LoyaltyHolderDirectory, useClass: PrismaLoyaltyHolderDirectory },
    { provide: LoyaltyConversionGate, useClass: PrismaLoyaltyConversionGate },
    { provide: LoyaltyLedgerReader, useClass: PrismaLoyaltyLedgerReader },
    { provide: LoyaltyEarnedOrdersReader, useClass: PrismaLoyaltyEarnedOrdersReader },
    OrderPointsCrediting,
    CreditOrderPointsHandler,
    CreditPendingOrderPointsHandler,
    CreditPointsOnHandover,
    CreditPointsOnPaymentSettled,
    SetLoyaltySettingsHandler,
    ConvertLoyaltyPointsHandler,
    AdjustLoyaltyPointsHandler,
    CancelLoyaltyVoucherHandler,
    ExpireLoyaltyVouchersHandler,
    GetLoyaltySettingsHandler,
    ListLoyaltyBalancesHandler,
    ListLoyaltyVouchersHandler,
  ],
})
export class LoyaltyModule {}
