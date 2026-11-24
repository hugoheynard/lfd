import type { CompanyPeriodQuotesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PeriodQuoteCompanyNotFoundError } from "../../domain/errors/period-quote-errors.js";
import { CompanyPeriodQuotesReader } from "../../domain/ports/company-period-quotes.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { billingFollowAt } from "../../domain/services/billed-payer.js";
import { ListCompanyPeriodQuotesQuery } from "./list-company-period-quotes.query.js";

/**
 * **Les devis de période d'une fiche client** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD7). Le devis appartient au
 * PAYEUR : la fiche d'un site qui suit la facturation d'un principal montre
 * ceux du principal, lu à l'instant de la requête — la règle de
 * `billingFollowAt`, celle qui choisit le payeur d'une commande.
 *
 * @throws {PeriodQuoteCompanyNotFoundError} aucun compte sous cet identifiant.
 */
@QueryHandler(ListCompanyPeriodQuotesQuery)
export class ListCompanyPeriodQuotesHandler implements IQueryHandler<
  ListCompanyPeriodQuotesQuery,
  CompanyPeriodQuotesView
> {
  constructor(
    private readonly standings: PayerStandingReader,
    private readonly quotes: CompanyPeriodQuotesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListCompanyPeriodQuotesQuery): Promise<CompanyPeriodQuotesView> {
    const now = this.clock.now();
    const standing = await this.standings.standingOf(query.companyId, now);
    if (standing === null) {
      throw new PeriodQuoteCompanyNotFoundError(query.companyId);
    }
    const follow = billingFollowAt(standing.companyId, now, standing.follows);
    const payer =
      follow === null
        ? { id: standing.companyId, name: standing.name }
        : { id: follow.payerId, name: follow.payerName };
    return {
      payerCompanyId: payer.id,
      payerName: payer.name,
      quotes: await this.quotes.liveOf(payer.id),
    };
  }
}
