import { Injectable } from "@nestjs/common";

import { PayerLiveMercurialeReader } from "../../account/domain/ports/payer-live-mercuriale.reader.js";
import { CompanyMercurialeReader } from "../domain/ports/company-mercuriale.reader.js";
import { actsAt } from "./board-category.js";

/**
 * Ce que la fiche Chorus demande à la tarification avant le devis de
 * période : une mercuriale qui **agit** chez ce client à cet instant. Une
 * mercuriale suspendue est rendue par `liveFor` mais n'agit pas — elle ne
 * tient aucun prix convenu.
 */
@Injectable()
export class PricingPayerLiveMercuriale extends PayerLiveMercurialeReader {
  constructor(private readonly mercuriales: CompanyMercurialeReader) {
    super();
  }

  async hasLiveMercuriale(companyId: string, at: Date): Promise<boolean> {
    const mercuriale = await this.mercuriales.liveFor(companyId, at);
    return mercuriale !== null && actsAt(mercuriale.suspendedFrom, at);
  }
}
