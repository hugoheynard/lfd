import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { NotifyPrincipalOnOrderCancelled } from "./application/handlers/notify-principal-on-order-cancelled.handler.js";
import { NotifyPrincipalOnOrderPaid } from "./application/handlers/notify-principal-on-order-paid.handler.js";
import { NotifyPrincipalOnOrderPlaced } from "./application/handlers/notify-principal-on-order-placed.handler.js";
import { NotifyPrincipalOnPaymentFailed } from "./application/handlers/notify-principal-on-payment-failed.handler.js";
import { GestureNoticeDispatcher } from "./application/services/gesture-notice.dispatcher.js";
import { PrincipalNoticeSender } from "./application/services/principal-notice.sender.js";
import { NotifyPrincipalOnDeliveryAddressAdded } from "./application/handlers/notify-principal-on-delivery-address-added.handler.js";
import { NotifyPrincipalOnDeliveryAddressUpdated } from "./application/handlers/notify-principal-on-delivery-address-updated.handler.js";
import { NotifyPrincipalOnDeliveryAddressRemoved } from "./application/handlers/notify-principal-on-delivery-address-removed.handler.js";
import { NotifyPrincipalOnDefaultDeliverySet } from "./application/handlers/notify-principal-on-default-delivery-set.handler.js";
import { NotifyPrincipalOnContactAdded } from "./application/handlers/notify-principal-on-contact-added.handler.js";
import { NotifyPrincipalOnContactUpdated } from "./application/handlers/notify-principal-on-contact-updated.handler.js";
import { NotifyPrincipalOnContactRemoved } from "./application/handlers/notify-principal-on-contact-removed.handler.js";
import { NotifyPrincipalOnPrimaryContactChanged } from "./application/handlers/notify-principal-on-primary-contact-changed.handler.js";
import { NotifyPrincipalOnBankAccountChanged } from "./application/handlers/notify-principal-on-bank-account-changed.handler.js";
import { NotifyPrincipalOnMandateProofAttached } from "./application/handlers/notify-principal-on-mandate-proof-attached.handler.js";
import { NotifyPrincipalOnSubscriptionCreated } from "./application/handlers/notify-principal-on-subscription-created.handler.js";
import { NotifyPrincipalOnSubscriptionStatusChanged } from "./application/handlers/notify-principal-on-subscription-status-changed.handler.js";
import { NotifyPrincipalOnSubscriptionDeleted } from "./application/handlers/notify-principal-on-subscription-deleted.handler.js";
import { NotifyPrincipalOnOrderProblemReported } from "./application/handlers/notify-principal-on-order-problem-reported.handler.js";
import { SubAccountNoticeDispatcher } from "./application/services/sub-account-notice.dispatcher.js";
import { NoticeSendJournal } from "./domain/ports/notice-send.journal.js";
import { PrismaNoticeSendJournal } from "./infrastructure/prisma-notice-send.journal.js";
import { ResetSubAccountNoticeRulesHandler } from "./application/commands/reset-sub-account-notice-rules.handler.js";
import { SetSubAccountNoticesEnabledHandler } from "./application/commands/set-sub-account-notices-enabled.handler.js";
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
 * N4a : le premier geste hors commande (problème signalé), dont le fait
 * durable porte le principal figé. N4b : les quatre gestes du carnet de
 * livraison, client et équipe. N4c : les quatre gestes sur les contacts.
 * N4d : le RIB et la preuve de mandat. N4e : les paniers récurrents.
 */
@Module({
  imports: [AccountModule, OrdersModule],
  controllers: [AdminSubAccountNoticesController],
  providers: [
    GetSubAccountNoticeRulesHandler,
    SetSubAccountNoticeRuleHandler,
    SetSubAccountNoticesEnabledHandler,
    ResetSubAccountNoticeRulesHandler,
    PrincipalNoticeSender,
    SubAccountNoticeDispatcher,
    GestureNoticeDispatcher,
    NotifyPrincipalOnOrderPlaced,
    NotifyPrincipalOnOrderPaid,
    NotifyPrincipalOnOrderCancelled,
    NotifyPrincipalOnPaymentFailed,
    NotifyPrincipalOnOrderProblemReported,
    NotifyPrincipalOnDeliveryAddressAdded,
    NotifyPrincipalOnDeliveryAddressUpdated,
    NotifyPrincipalOnDeliveryAddressRemoved,
    NotifyPrincipalOnDefaultDeliverySet,
    NotifyPrincipalOnContactAdded,
    NotifyPrincipalOnContactUpdated,
    NotifyPrincipalOnContactRemoved,
    NotifyPrincipalOnPrimaryContactChanged,
    NotifyPrincipalOnBankAccountChanged,
    NotifyPrincipalOnMandateProofAttached,
    NotifyPrincipalOnSubscriptionCreated,
    NotifyPrincipalOnSubscriptionStatusChanged,
    NotifyPrincipalOnSubscriptionDeleted,
    { provide: NoticeSendJournal, useClass: PrismaNoticeSendJournal },
  ],
})
export class SubAccountNoticesModule {}
