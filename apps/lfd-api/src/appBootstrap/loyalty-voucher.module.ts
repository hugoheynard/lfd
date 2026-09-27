import { Global, Module } from "@nestjs/common";

import { LoyaltyEarningPreviewing } from "../b2b/loyalty/application/services/loyalty-earning-previewing.js";
import { LoyaltyVoucherQuoting } from "../b2b/loyalty/application/services/loyalty-voucher-quoting.js";
import { LoyaltyVoucherRedeeming } from "../b2b/loyalty/application/services/loyalty-voucher-redeeming.js";
import { LoyaltyModule } from "../b2b/loyalty/loyalty.module.js";
import { LoyaltyEarningPreview } from "../b2b/orders/domain/ports/loyalty-earning-preview.js";
import { LoyaltyVoucherQuoteReader } from "../b2b/orders/domain/ports/loyalty-voucher-quote.reader.js";
import { LoyaltyVoucherRedemption } from "../b2b/orders/domain/ports/loyalty-voucher-redemption.js";

/**
 * Le fil qui relie **la commande au bon de fidélité** (plan
 * `documentation/comptabilite/plan-points-de-fidelite.md`, C3, §11 bis S8).
 *
 * La commande déclare ce dont elle a besoin — lire ce que vaut un bon, puis
 * l'engager, le rendre, solder son reliquat ; et depuis E1, prévoir ce qu'un
 * panier rapporterait — et la fidélité y répond, parce
 * qu'elle possède les bons. Le câblage vit ici et pas dans l'un des deux
 * modules : `LoyaltyModule` importe déjà `OrdersModule` pour lire les
 * commandes définitives, et l'import inverse ferait un cycle.
 *
 * `@Global` pour la même raison que `DebtorMandateModule` : le consommateur
 * est `orders`, qui ne peut pas importer le module de la fidélité. Les tokens
 * restent ceux de la commande, donc rien de neuf n'est rendu atteignable.
 *
 * ⚠️ `lint:context-boundaries` ne regarde pas l'intérieur de `b2b` : cette
 * frontière tient par discipline, pas par la porte.
 */
@Global()
@Module({
  imports: [LoyaltyModule],
  providers: [
    { provide: LoyaltyVoucherQuoteReader, useExisting: LoyaltyVoucherQuoting },
    { provide: LoyaltyVoucherRedemption, useExisting: LoyaltyVoucherRedeeming },
    // « Vous gagnerez N points » : le devis connecté le demande (plan E1.2).
    { provide: LoyaltyEarningPreview, useExisting: LoyaltyEarningPreviewing },
  ],
  exports: [LoyaltyVoucherQuoteReader, LoyaltyVoucherRedemption, LoyaltyEarningPreview],
})
export class LoyaltyVoucherModule {}
