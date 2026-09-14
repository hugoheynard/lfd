import type { CustomerBankAccountView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { ensureBankAccountAccess } from "../../domain/services/bank-account-access.js";
import { customerBankAccountView } from "./customer-bank-account-view.js";
import { GetMyCompanyBankAccountQuery } from "./get-my-company-bank-account.query.js";

/**
 * Rend le RIB de la société au détenteur ou au rôle facturation, ou `null`
 * s'il n'en a jamais été déposé.
 *
 * La vue est celle du staff **sans les zones 14 et 19** : ce sont des réglages
 * du mandat, pas des coordonnées que le client recopie. Et l'IBAN ne redescend
 * pas davantage ici — `last4`, rien d'autre.
 */
@QueryHandler(GetMyCompanyBankAccountQuery)
export class GetMyCompanyBankAccountHandler implements IQueryHandler<
  GetMyCompanyBankAccountQuery,
  CustomerBankAccountView | null
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly accounts: CompanyBankAccountRepository,
  ) {}

  async execute(query: GetMyCompanyBankAccountQuery): Promise<CustomerBankAccountView | null> {
    const role = await this.guard.roleOf(query.actorUserId, query.companyId);
    ensureBankAccountAccess(role, query.companyId);

    const found = await this.accounts.findByCompany(query.companyId);
    return found === null ? null : customerBankAccountView(found);
  }
}
