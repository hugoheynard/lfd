import { Module } from "@nestjs/common";

import { PayLinkTestBell } from "./application/pay-link-test-bell.js";
import { PayLinkTestLinkable } from "./application/pay-link-test-linkable.js";
import { PayLinkTestRefundOutcomes } from "./application/pay-link-test-refund-outcomes.js";
import { PayLinkTestSettlement } from "./application/pay-link-test-settlement.js";
import { SendPayLinkTestHandler } from "./application/commands/send-pay-link-test.handler.js";
import { RefundPaidPayLinkTest } from "./application/handlers/refund-paid-pay-link-test.handler.js";
import { ListPayLinkTestRecipientsHandler } from "./application/queries/list-pay-link-test-recipients.handler.js";
import { ListPayLinkTestsHandler } from "./application/queries/list-pay-link-tests.handler.js";
import { PayLinkTestReader } from "./domain/ports/pay-link-test.reader.js";
import { PayLinkTestRepository } from "./domain/ports/pay-link-test.repository.js";
import { AdminPayLinkTestsController } from "./http/admin-pay-link-tests.controller.js";
import { PrismaPayLinkTestReader } from "./infrastructure/prisma-pay-link-test.reader.js";
import { PrismaPayLinkTestRepository } from "./infrastructure/prisma-pay-link-test.repository.js";

/**
 * **Le lien de paiement d'essai** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») : la
 * table `payment.pay_link_test`, le sujet `payment_test` que le bloc possède
 * lui-même, l'abonné qui rembourse et les routes d'équipe.
 *
 * Il EXPORTE ses deux implémenteurs du canal des sujets : la racine de
 * composition les range aux deux fils (`appBootstrap/pay-link-feed.module.ts`
 * et `appBootstrap/card-payment-feed.module.ts`), comme ceux d'un bloc métier.
 * `PayLinks`, `CardRefunds` et les ports du staff et du `mail` sont globaux.
 */
@Module({
  controllers: [AdminPayLinkTestsController],
  providers: [
    { provide: PayLinkTestRepository, useClass: PrismaPayLinkTestRepository },
    { provide: PayLinkTestReader, useClass: PrismaPayLinkTestReader },
    PayLinkTestBell,
    PayLinkTestRefundOutcomes,
    PayLinkTestLinkable,
    PayLinkTestSettlement,
    SendPayLinkTestHandler,
    ListPayLinkTestsHandler,
    ListPayLinkTestRecipientsHandler,
    RefundPaidPayLinkTest,
  ],
  exports: [PayLinkTestLinkable, PayLinkTestSettlement],
})
export class PayLinkTestModule {}
