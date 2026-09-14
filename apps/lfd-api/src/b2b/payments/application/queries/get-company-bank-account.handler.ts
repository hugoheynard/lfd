import type { CompanyBankAccountView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { customerBankAccountView } from "./customer-bank-account-view.js";
import { GetCompanyBankAccountQuery } from "./get-company-bank-account.query.js";

/**
 * Rend le RIB d'un client, ou `null` s'il n'en a jamais déposé — le cas
 * ordinaire aujourd'hui.
 *
 * 🔴 **L'IBAN ne franchit pas cette frontière.** Il est relu en clair par
 * l'adaptateur pour reconstituer l'agrégat — c'est ce qui permet aux value
 * objects de refuser une ligne abîmée — mais la vue n'en garde que les quatre
 * derniers caractères. Une réponse d'API qui porterait un IBAN entier est une
 * réponse qui finit dans un journal d'accès.
 *
 * La vue staff est celle du client augmentée des zones 14 et 19 : le mapping
 * des coordonnées n'est écrit qu'une fois, dans `customerBankAccountView`.
 */
@QueryHandler(GetCompanyBankAccountQuery)
export class GetCompanyBankAccountHandler implements IQueryHandler<
  GetCompanyBankAccountQuery,
  CompanyBankAccountView | null
> {
  constructor(private readonly accounts: CompanyBankAccountRepository) {}

  async execute({ companyId }: GetCompanyBankAccountQuery): Promise<CompanyBankAccountView | null> {
    const found = await this.accounts.findByCompany(companyId);
    if (found === null) {
      return null;
    }

    return {
      ...customerBankAccountView(found),
      debtorReference: found.options.debtorReference,
      contractNumber: found.options.contractNumber,
    };
  }
}
