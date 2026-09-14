import type { CustomerMandateOptionsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { GetMyCompanyMandateOptionsQuery } from "./get-my-company-mandate-options.query.js";

/**
 * Rend les zones 14 et 19 au client, ou `null` tant qu'aucun RIB n'est déposé
 * — elles vivent sur sa ligne.
 *
 * Même seuil que les autres routes client du mandat (404 → 403 → drapeau 409) :
 * une carte qui montrerait des zones qu'aucune route ne permet d'écrire
 * promettrait un geste que le serveur refuse. La lecture, elle, ne refuse pas
 * sous un mandat actif : les voir est ce qui permet de savoir quoi demander.
 */
@QueryHandler(GetMyCompanyMandateOptionsQuery)
export class GetMyCompanyMandateOptionsHandler implements IQueryHandler<
  GetMyCompanyMandateOptionsQuery,
  CustomerMandateOptionsView | null
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly gate: CustomerMandateGate,
    private readonly accounts: CompanyBankAccountRepository,
  ) {}

  async execute({
    actorUserId,
    companyId,
  }: GetMyCompanyMandateOptionsQuery): Promise<CustomerMandateOptionsView | null> {
    await ensureCustomerMandateAccess(
      { guard: this.guard, gate: this.gate },
      actorUserId,
      companyId,
    );

    const found = await this.accounts.findByCompany(companyId);
    if (found === null) {
      return null;
    }
    return {
      debtorReference: found.options.debtorReference,
      contractNumber: found.options.contractNumber,
    };
  }
}
