import { Injectable } from "@nestjs/common";

import {
  LoyaltyEarningPreview,
  type LoyaltyEarningBasis,
} from "../../../orders/domain/ports/loyalty-earning-preview.js";
import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { earningFor } from "../../domain/services/order-earning.js";

/** Le devis n'a pas encore de commande : l'identité n'entre pas dans le calcul. */
const QUOTE_ORDER_ID = "quote";

/**
 * La fidélité répond au devis : **combien de points rapporterait ce panier ?**
 * (plan des points, E1.2). Implémente le port que la commande déclare ; relié
 * dans `appBootstrap/loyalty-voucher.module.ts`.
 *
 * 🔴 Par la fonction même du crédit ({@link earningFor}), sur une commande
 * de particulier au compte connectable : la règle d'assiette et d'ouverture
 * n'existe qu'une fois, et ce que le panier annonce est ce que la remise
 * créditera — au réglage près, qui peut changer entre les deux.
 */
@Injectable()
export class LoyaltyEarningPreviewing extends LoyaltyEarningPreview {
  constructor(private readonly settings: LoyaltySettingsReader) {
    super();
  }

  async pointsToEarn(basis: LoyaltyEarningBasis): Promise<number | null> {
    const earning = earningFor(
      {
        orderId: QUOTE_ORDER_ID,
        orderNumber: QUOTE_ORDER_ID,
        clientele: "public",
        companyId: null,
        placedByUserId: basis.buyerUserId,
        buyerHasAccount: true,
        subtotalCents: basis.subtotalCents,
        discountCents: basis.discountCents,
        voucherDiscountCents: basis.voucherDiscountCents,
      },
      await this.settings.read(),
    );
    return earning.kind === "earn" ? earning.points : null;
  }
}
