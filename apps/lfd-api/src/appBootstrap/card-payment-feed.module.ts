import { Global, Module } from "@nestjs/common";

import { OrdersModule } from "../b2b/orders/orders.module.js";
import { OrderSubjectSettlement } from "../b2b/orders/application/services/order-subject-settlement.js";
import { ORDER_CARD_SUBJECT_TYPE } from "../b2b/orders/application/services/order-card-subject.js";
import {
  RegisteredSubjectSettlements,
  SubjectSettlements,
} from "../card-payment/channels/subjects/index.js";
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
 *   un type de sujet et un compte** : `order → lfc-stripe`. Un bloc métier
 *   ne nomme jamais un compte (§3.2), et `card-payment` ne sait pas ce
 *   qu'est une commande ;
 * - `SubjectSettlements` — les implémenteurs du canal retour, un par type de
 *   sujet : `order` aujourd'hui, l'instance d'`OrdersModule`.
 *
 * `@Global` pour la raison du fil du fournil : le consommateur est
 * `card-payment/`, qui ne peut pas importer le commerce.
 */
@Global()
@Module({
  imports: [OrdersModule],
  providers: [
    {
      provide: CardAccountDefaults,
      useValue: new DeclaredCardAccountDefaults({ [ORDER_CARD_SUBJECT_TYPE]: "lfc-stripe" }),
    },
    {
      provide: SubjectSettlements,
      useFactory: (order: OrderSubjectSettlement): SubjectSettlements =>
        new RegisteredSubjectSettlements([order]),
      inject: [OrderSubjectSettlement],
    },
  ],
  exports: [CardAccountDefaults, SubjectSettlements],
})
export class CardPaymentFeedModule {}
