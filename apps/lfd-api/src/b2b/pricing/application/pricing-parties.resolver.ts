import { Injectable } from "@nestjs/common";

import { NO_PARTIES, type PricingParties } from "../domain/loaded-pricer.js";
import { PricingAccountReader } from "../domain/ports/pricing-account.reader.js";

/**
 * **La seule fabrique des parties d'un prix** (`plan-sous-comptes.md`, §2.2).
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

  /** Les parties pour cette société servie, à `at` ; aucune société, aucune clé. */
  async partiesAt(companyId: string | null, at: Date): Promise<PricingParties> {
    if (companyId === null) {
      return NO_PARTIES;
    }
    return { companyId, pricingCompanyId: await this.accounts.pricingAccountOf(companyId, at) };
  }
}
