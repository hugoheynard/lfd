import { Injectable } from "@nestjs/common";

import { QuoteMercurialeReader } from "../../accounting/domain/ports/quote-mercuriale.reader.js";
import { CompanyMercurialeReader } from "../domain/ports/company-mercuriale.reader.js";
import { actsAt } from "./board-category.js";

/**
 * **La mercuriale que cite un devis de période** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD4) : celle qui AGIT chez le
 * payeur à l'instant demandé — la règle du tarif convenu
 * (`PricingNegotiatedScope`) : suspendue, elle ne tient aucun prix, et le
 * devis ne la cite pas.
 */
@Injectable()
export class PricingQuoteMercurialeReader extends QuoteMercurialeReader {
  constructor(private readonly mercuriales: CompanyMercurialeReader) {
    super();
  }

  async labelAt(payerCompanyId: string, at: Date): Promise<string | null> {
    const mercuriale = await this.mercuriales.liveFor(payerCompanyId, at);
    return mercuriale === null || !actsAt(mercuriale.suspendedFrom, at) ? null : mercuriale.label;
  }
}
