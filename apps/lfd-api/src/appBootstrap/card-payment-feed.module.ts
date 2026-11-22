import { Global, Module } from "@nestjs/common";

import { OrdersModule } from "../lafoliecoffee/orders/orders.module.js";
import { FreeChargeSettlement } from "../lafoliecoffee/payments/application/free-charge/free-charge-settlement.js";
import { FREE_CHARGE_SUBJECT_TYPE } from "../lafoliecoffee/payments/application/free-charge/free-charge-subject.js";
import { PaymentsModule } from "../lafoliecoffee/payments/payments.module.js";
import { OrderSubjectSettlement } from "../lafoliecoffee/orders/application/services/order-subject-settlement.js";
import { ORDER_CARD_SUBJECT_TYPE } from "../lafoliecoffee/orders/application/services/order-card-subject.js";
import {
  RegisteredSubjectSettlements,
  SubjectSettlements,
} from "../payment/channels/subjects/index.js";
import {
  CardAccountDefaults,
  DeclaredCardAccountDefaults,
} from "../platform/config/card-accounts.js";

/**
 * **Le fil de l'encaissement par carte, relié** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.2, §3.3, lot P0.c2) — la figure de `ProductionFeedModule` : le bloc
 * `card-payment` DÉCLARE ce dont il a besoin, et la racine de composition le
 * relie, seule à connaître les deux côtés.
 *
 * Deux jetons :
 *
 * - `CardAccountDefaults` — **la seule ligne du dépôt qui connaisse à la fois
 *   un type de sujet et un compte** : `order → lfc-stripe`, `free_charge →
 *   lfc-stripe` (la demande de paiement libre). Un bloc métier
 *   ne nomme jamais un compte (§3.2), et `card-payment` ne sait pas ce
 *   qu'est une commande ;
 * - `SubjectSettlements` — les implémenteurs du canal retour, un par type de
 *   sujet : `order` (l'instance d'`OrdersModule`) et `free_charge` (celle de
 *   `PaymentsModule`).
 *
 * `@Global` pour la raison du fil du fournil : le consommateur est
 * `payment/`, qui ne peut pas importer le commerce.
 */
@Global()
@Module({
  imports: [OrdersModule, PaymentsModule],
  providers: [
    {
      provide: CardAccountDefaults,
      useValue: new DeclaredCardAccountDefaults({
        [ORDER_CARD_SUBJECT_TYPE]: "lfc-stripe",
        [FREE_CHARGE_SUBJECT_TYPE]: "lfc-stripe",
      }),
    },
    {
      provide: SubjectSettlements,
      useFactory: (
        order: OrderSubjectSettlement,
        freeCharge: FreeChargeSettlement,
      ): SubjectSettlements => new RegisteredSubjectSettlements([order, freeCharge]),
      inject: [OrderSubjectSettlement, FreeChargeSettlement],
    },
  ],
  exports: [CardAccountDefaults, SubjectSettlements],
})
export class CardPaymentFeedModule {}
