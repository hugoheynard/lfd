import { Module } from "@nestjs/common";

import { AdjustLoyaltyPointsHandler } from "./application/commands/adjust-loyalty-points.handler.js";
import { CancelLoyaltyVoucherHandler } from "./application/commands/cancel-loyalty-voucher.handler.js";
import { CreditOrderPointsHandler } from "./application/commands/credit-order-points.handler.js";
import { CreditPendingOrderPointsHandler } from "./application/commands/credit-pending-order-points.handler.js";
import { ConvertLoyaltyPointsHandler } from "./application/commands/convert-loyalty-points.handler.js";
import { ExpireLoyaltyVouchersHandler } from "./application/commands/expire-loyalty-vouchers.handler.js";
import { SetLoyaltySettingsHandler } from "./application/commands/set-loyalty-settings.handler.js";
import { SettleVoucherRemaindersHandler } from "./application/commands/settle-voucher-remainders.handler.js";
import { LoyaltyVoucherQuoting } from "./application/services/loyalty-voucher-quoting.js";
import { LoyaltyVoucherRedeeming } from "./application/services/loyalty-voucher-redeeming.js";
import { LoyaltyHolderLock } from "./domain/ports/loyalty-holder.lock.js";
import { PrismaLoyaltyHolderLock } from "./infrastructure/prisma-loyalty-holder.lock.js";
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
import { MyLoyaltyController } from "./http/my-loyalty.controller.js";
import { GetMyLoyaltyHandler } from "./application/queries/get-my-loyalty.handler.js";
import { LoyaltyEarningPreviewing } from "./application/services/loyalty-earning-previewing.js";
import { HolderLoyaltyReader } from "./domain/ports/holder-loyalty.reader.js";
import { PrismaHolderLoyaltyReader } from "./infrastructure/prisma-holder-loyalty.reader.js";
import { LoyaltySweepController } from "./http/loyalty-sweep.controller.js";
import { PrismaLoyaltyAccountRepository } from "./infrastructure/prisma-loyalty-account.repository.js";
import { PrismaLoyaltyConversionGate } from "./infrastructure/prisma-loyalty-conversion.gate.js";
import { PrismaLoyaltyEarnedOrdersReader } from "./infrastructure/prisma-loyalty-earned-orders.reader.js";
import { PrismaLoyaltyHolderDirectory } from "./infrastructure/prisma-loyalty-holder.directory.js";
import { PrismaLoyaltyLedgerReader } from "./infrastructure/prisma-loyalty-ledger.reader.js";
import { PrismaLoyaltySettingsStore } from "./infrastructure/prisma-loyalty-settings.store.js";
import { PrismaLoyaltyVoucherRepository } from "./infrastructure/prisma-loyalty-voucher.repository.js";

/**
 * Contexte **fidélité** : le grand livre de points, les bons de fidélité, le
 * réglage du ratio (plan `documentation/comptabilite/plan-points-de-fidelite.md`).
 *
 * Programme livré FERMÉ : tant que la comptabilité n'a pas enregistré de
 * réglage, aucune conversion ne passe et aucune commande ne crédite. Le
 * particulier lit et convertit ses points par `me/loyalty` (lot E1).
 *
 * Le crédit des commandes (lot D) lit les commandes définitives par le port
 * que `orders` exporte (`CompletedOrderReader`) — d'où l'import de son module,
 * dans ce sens seulement : `orders` ne connaît pas la fidélité.
 *
 * Le bon sur la commande (lot C) : `orders` DÉCLARE ce qu'il demande
 * (`LoyaltyVoucherQuoteReader`, `LoyaltyVoucherRedemption`), ce module
 * l'implémente et l'exporte, et `appBootstrap/loyalty-voucher.module.ts` relie
 * les deux — l'inverse de l'import ci-dessous ferait un cycle (§11 bis S8).
 */
@Module({
  imports: [OrdersModule],
  controllers: [AdminLoyaltyController, LoyaltySweepController, MyLoyaltyController],
  providers: [
    PrismaLoyaltySettingsStore,
    { provide: LoyaltySettingsReader, useExisting: PrismaLoyaltySettingsStore },
    { provide: LoyaltySettingsWriter, useExisting: PrismaLoyaltySettingsStore },
    { provide: LoyaltyHolderLock, useClass: PrismaLoyaltyHolderLock },
    { provide: LoyaltyAccountRepository, useClass: PrismaLoyaltyAccountRepository },
    { provide: LoyaltyVoucherRepository, useClass: PrismaLoyaltyVoucherRepository },
    { provide: LoyaltyHolderDirectory, useClass: PrismaLoyaltyHolderDirectory },
    { provide: LoyaltyConversionGate, useClass: PrismaLoyaltyConversionGate },
    { provide: LoyaltyLedgerReader, useClass: PrismaLoyaltyLedgerReader },
    { provide: HolderLoyaltyReader, useClass: PrismaHolderLoyaltyReader },
    { provide: LoyaltyEarnedOrdersReader, useClass: PrismaLoyaltyEarnedOrdersReader },
    OrderPointsCrediting,
    LoyaltyVoucherQuoting,
    LoyaltyVoucherRedeeming,
    SettleVoucherRemaindersHandler,
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
    GetMyLoyaltyHandler,
    LoyaltyEarningPreviewing,
  ],
  exports: [LoyaltyVoucherQuoting, LoyaltyVoucherRedeeming, LoyaltyEarningPreviewing],
})
export class LoyaltyModule {}
