import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { NotifyPrincipalOnOrderCancelled } from "./application/handlers/notify-principal-on-order-cancelled.handler.js";
import { NotifyPrincipalOnOrderPaid } from "./application/handlers/notify-principal-on-order-paid.handler.js";
import { NotifyPrincipalOnOrderPlaced } from "./application/handlers/notify-principal-on-order-placed.handler.js";
import { NotifyPrincipalOnPaymentFailed } from "./application/handlers/notify-principal-on-payment-failed.handler.js";
import { SubAccountNoticeDispatcher } from "./application/services/sub-account-notice.dispatcher.js";
import { NoticeSendJournal } from "./domain/ports/notice-send.journal.js";
import { PrismaNoticeSendJournal } from "./infrastructure/prisma-notice-send.journal.js";
import { ResetSubAccountNoticeRulesHandler } from "./application/commands/reset-sub-account-notice-rules.handler.js";
import { SetSubAccountNoticeRuleHandler } from "./application/commands/set-sub-account-notice-rule.handler.js";
import { GetSubAccountNoticeRulesHandler } from "./application/queries/get-sub-account-notice-rules.handler.js";
import { AdminSubAccountNoticesController } from "./http/admin-sub-account-notices.controller.js";

/**
 * **Les avis au principal** — prévenir les membres d'un principal de ce que
 * font ses sous-comptes (`documentation/comptes-client/plan-notifications-sous-comptes.md`).
 *
 * Contexte à part d'`account/` : son langage est celui d'un avis (action,
 * destinataire, dérogation), pas celui d'une société. Il ne lit les tables
 * d'`account/` que par les ports que celui-ci déclare et implémente.
 * N1 : le tableau et son réglage. N2 : les trois abonnés durables des faits
 * de commande, qui lisent la commande par le port qu'`orders/` exporte.
 */
@Module({
  imports: [AccountModule, OrdersModule],
  controllers: [AdminSubAccountNoticesController],
  providers: [
    GetSubAccountNoticeRulesHandler,
    SetSubAccountNoticeRuleHandler,
    ResetSubAccountNoticeRulesHandler,
    SubAccountNoticeDispatcher,
    NotifyPrincipalOnOrderPlaced,
    NotifyPrincipalOnOrderPaid,
    NotifyPrincipalOnOrderCancelled,
    NotifyPrincipalOnPaymentFailed,
    { provide: NoticeSendJournal, useClass: PrismaNoticeSendJournal },
  ],
})
export class SubAccountNoticesModule {}
