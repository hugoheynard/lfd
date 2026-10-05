import { Injectable } from "@nestjs/common";

import { CompanyFollowsReader } from "../../account/domain/ports/company-follows.reader.js";
import { PricingAccountReader } from "../domain/ports/pricing-account.reader.js";

/**
 * Le compte de tarif lu sur les périodes de suivi `pricing` du sous-compte
 * (`company_follows`), début inclus, fin exclue.
 *
 * Sans période qui couvre `at`, la société paie son propre tarif : c'est ce
 * qui fait retomber un sous-compte qui a cessé de suivre sur sa mercuriale, ou
 * au tarif public s'il n'en a pas (R4).
 */
@Injectable()
export class FollowedPricingAccountReader extends PricingAccountReader {
  constructor(private readonly follows: CompanyFollowsReader) {
    super();
  }

  async pricingAccountOf(companyId: string, at: Date): Promise<string> {
    const period = await this.follows.followsAt(companyId, "pricing", at);
    return period?.parentId ?? companyId;
  }
}
