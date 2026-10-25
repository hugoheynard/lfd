import { Global, Module } from "@nestjs/common";

import { AccountingModule } from "../b2b/accounting/accounting.module.js";
import { AccountOrderEngaging } from "../b2b/accounting/application/services/account-order-engaging.js";
import { AccountOrderRevaluing } from "../b2b/accounting/application/services/account-order-revaluing.js";
import { AccountOrderSettling } from "../b2b/accounting/application/services/account-order-settling.js";
import {
  AccountOrderEngagement,
  AccountOrderEngagementReader,
} from "../b2b/orders/domain/ports/account-order-engagement.js";
import { AccountOrderRevaluation } from "../b2b/orders/domain/ports/account-order-revaluation.js";
import { AccountOrderSettlement } from "../b2b/orders/domain/ports/account-order-settlement.js";

/**
 * Le fil qui relie **l'annulation d'une commande au compte à la
 * comptabilité** (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
 * lot C5, C5.4 et C5.5).
 *
 * La commande déclare ce dont elle a besoin — lire ce que la comptabilité a
 * engagé, puis fermer la ligne d'encaissement — et la comptabilité y répond,
 * parce qu'elle possède `order_collection`. Deux tokens pour un seul
 * adaptateur (ISP) : l'aperçu du détail ne reçoit que la lecture.
 *
 * Depuis le 2026-10-23, un troisième token pour un second adaptateur : la
 * modification d'une commande au compte recale le montant de sa ligne
 * d'encaissement (`plan-modifier-une-commande.md`, M1).
 *
 * Depuis le 2026-10-25, un quatrième : le solde d'une commande recale sa
 * ligne d'encaissement encore `due` sur le montant facturable (plan E6c2).
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
    { provide: AccountOrderRevaluation, useExisting: AccountOrderRevaluing },
    { provide: AccountOrderSettlement, useExisting: AccountOrderSettling },
  ],
  exports: [
    AccountOrderEngagement,
    AccountOrderEngagementReader,
    AccountOrderRevaluation,
    AccountOrderSettlement,
  ],
})
export class AccountOrderEngagementModule {}
