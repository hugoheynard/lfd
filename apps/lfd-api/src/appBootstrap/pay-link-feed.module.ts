import { Global, Module } from "@nestjs/common";

import { FreeChargeLinkable } from "../lafoliecoffee/payments/application/free-charge/free-charge-linkable.js";
import { PaymentsModule } from "../lafoliecoffee/payments/payments.module.js";
import {
  LinkableSubjects,
  RegisteredLinkableSubjects,
} from "../payment/channels/subjects/index.js";

/**
 * **Le fil des liens de paiement, relié** (doc
 * `documentation/payment/les-liens-de-paiement.md`) — la figure de `CardPaymentFeedModule` : `payment` DÉCLARE
 * `LinkableSubjects`, la racine de composition y range les implémenteurs.
 *
 * Un implémenteur aujourd'hui : la demande de paiement libre (`free_charge`,
 * `PaymentsModule`). La facture (`invoice`) s'y ajoutera à son lot ; un type
 * absent d'ici est refusé par `PayLinks.open`, qui le dit.
 */
@Global()
@Module({
  imports: [PaymentsModule],
  providers: [
    {
      provide: LinkableSubjects,
      useFactory: (freeCharge: FreeChargeLinkable): LinkableSubjects =>
        new RegisteredLinkableSubjects([freeCharge]),
      inject: [FreeChargeLinkable],
    },
  ],
  exports: [LinkableSubjects],
})
export class PayLinkFeedModule {}
