import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CompanyPricingView } from "@lfd/contracts";

import { CompanyPricingQuery } from "./company-pricing.query.js";
import { ReadCompanyPricingQuery } from "./read-company-pricing.query.js";

/**
 * ⚠️ `CompanyPricingQuery` porte le suffixe `Query` sans être une question du
 * bus : c'est le service de lecture, cité tel quel par la documentation, et le
 * renommer sortirait du lot.
 */
@QueryHandler(ReadCompanyPricingQuery)
export class ReadCompanyPricingHandler implements IQueryHandler<
  ReadCompanyPricingQuery,
  CompanyPricingView
> {
  constructor(private readonly pricing: CompanyPricingQuery) {}

  execute(query: ReadCompanyPricingQuery): Promise<CompanyPricingView> {
    return this.pricing.forCompany(query.companyId);
  }
}
