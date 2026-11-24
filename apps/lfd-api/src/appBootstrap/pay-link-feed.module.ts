import { Global, Module } from "@nestjs/common";

import { FreeChargeLinkable } from "../lafoliecoffee/payments/application/free-charge/free-charge-linkable.js";
import { PaymentsModule } from "../lafoliecoffee/payments/payments.module.js";
import { PayLinkTestLinkable } from "../payment/link/test/application/pay-link-test-linkable.js";
import { PayLinkTestModule } from "../payment/link/test/pay-link-test.module.js";
import {
  LinkableSubjects,
  RegisteredLinkableSubjects,
} from "../payment/channels/subjects/index.js";

/**
 * **Le fil des liens de paiement, relié** (doc
 * `documentation/payment/les-liens-de-paiement.md`) — la figure de `CardPaymentFeedModule` : `payment` DÉCLARE
 * `LinkableSubjects`, la racine de composition y range les implémenteurs.
 *
 * Deux implémenteurs : la demande de paiement libre (`free_charge`,
 * `PaymentsModule`) et l'essai du bloc lui-même (`payment_test`,
 * `PayLinkTestModule`). La facture (`invoice`) s'y ajoutera à son lot ; un type
 * absent d'ici est refusé par `PayLinks.open`, qui le dit.
 */
@Global()
@Module({
  imports: [PaymentsModule, PayLinkTestModule],
  providers: [
    {
      provide: LinkableSubjects,
      useFactory: (freeCharge: FreeChargeLinkable, test: PayLinkTestLinkable): LinkableSubjects =>
        new RegisteredLinkableSubjects([freeCharge, test]),
      inject: [FreeChargeLinkable, PayLinkTestLinkable],
    },
  ],
  exports: [LinkableSubjects],
})
export class PayLinkFeedModule {}
