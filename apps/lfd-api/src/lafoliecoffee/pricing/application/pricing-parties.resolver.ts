import { Injectable } from "@nestjs/common";

import { NO_PARTIES, type PricingParties } from "../domain/loaded-pricer.js";
import { PricingAccountReader } from "../domain/ports/pricing-account.reader.js";
import type { LotBuyer } from "../../promotions/domain/lot-buyer.js";
import type { PricedBuyerKind } from "../../promotions/domain/promotion-targeting.js";

/**
 * **La seule fabrique des parties d'un prix** (`sous-comptes.md`, §2.2).
 *
 * Toutes les questions de prix d'un client y passent — la porte du prix
 * (caisse, devis, vitrine, projection) et l'onglet « Tarifs » de la fiche —,
 * pour que la seconde clé soit résolue au même endroit, à l'instant de la
 * lecture. Un `if parent` écrit chez un appelant serait un second encodage du
 * suivi, et le premier oublié rendrait le tarif d'un autre compte.
 */
@Injectable()
export class PricingPartiesResolver {
  constructor(private readonly accounts: PricingAccountReader) {}

  /**
   * Les parties de l'acheteur d'un lot — la porte du prix.
   *
   * Un pro type (`plan-export-grille-de-prix.md`, § 8) n'est AUCUNE société :
   * ni compte de tarif, ni mercuriale, ni engagement ; il porte ses faits
   * d'audience déclarés jusqu'au point ligne.
   */
  partiesFor(buyer: LotBuyer, at: Date): Promise<PricingParties> {
    switch (buyer.kind) {
      case "typical":
        return Promise.resolve({ ...NO_PARTIES, typical: buyer });
      case "real":
        return this.partiesAt(buyer.companyId, at, buyer.buyerKind);
    }
  }

  /**
   * Les parties pour cette société servie, à `at` ; aucune société, aucune
   * clé. La porte d'entrée est recopiée telle que la route l'a posée.
   */
  async partiesAt(
    companyId: string | null,
    at: Date,
    buyerKind: PricedBuyerKind,
  ): Promise<PricingParties> {
    if (companyId === null) {
      return { ...NO_PARTIES, buyerKind };
    }
    return {
      companyId,
      pricingCompanyId: await this.accounts.pricingAccountOf(companyId, at),
      buyerKind,
    };
  }
}
