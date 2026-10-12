import { Global, Module } from "@nestjs/common";

import { AccountingModule } from "../b2b/accounting/accounting.module.js";
import { AccountOrderEngaging } from "../b2b/accounting/application/services/account-order-engaging.js";
import {
  AccountOrderEngagement,
  AccountOrderEngagementReader,
} from "../b2b/orders/domain/ports/account-order-engagement.js";

/**
 * Le fil qui relie **l'annulation d'une commande au compte à la
 * comptabilité** (plan `documentation/order/plan-annulation-de-commande.md`,
 * lot C5, C5.4 et C5.5).
 *
 * La commande déclare ce dont elle a besoin — lire ce que la comptabilité a
 * engagé, puis fermer la ligne d'encaissement — et la comptabilité y répond,
 * parce qu'elle possède `order_collection`. Deux tokens pour un seul
 * adaptateur (ISP) : l'aperçu du détail ne reçoit que la lecture.
 *
 * `@Global` pour la même raison que `LoyaltyVoucherModule` : le consommateur
 * est `orders`, et le câblage ne vit dans aucun des deux modules.
 *
 * ⚠️ `lint:context-boundaries` ne regarde pas l'intérieur de `b2b` : cette
 * frontière tient par discipline, pas par la porte.
 */
@Global()
@Module({
  imports: [AccountingModule],
  providers: [
    { provide: AccountOrderEngagement, useExisting: AccountOrderEngaging },
    { provide: AccountOrderEngagementReader, useExisting: AccountOrderEngaging },
  ],
  exports: [AccountOrderEngagement, AccountOrderEngagementReader],
})
export class AccountOrderEngagementModule {}
