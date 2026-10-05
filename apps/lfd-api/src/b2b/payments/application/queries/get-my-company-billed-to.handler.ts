import type { CustomerBilledToView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { MandateDebtorReader } from "../../domain/ports/mandate-debtor.reader.js";
import { ensureBankAccountAccess } from "../../domain/services/bank-account-access.js";
import { GetMyCompanyBilledToQuery } from "./get-my-company-billed-to.query.js";

/**
 * « Facturé à _Principal_ » — la seule chose qu'un site voit de son payeur
 * (`plan-sous-comptes.md` §3).
 *
 * Même mur que la section RIB (détenteur ou facturation ; non-membre 404,
 * autre rôle 403) : c'est sur cet écran que la mention remplace un RIB absent.
 * Le nom, et rien d'autre — ni l'IBAN, ni le mandat, ni l'identifiant du
 * principal, qu'aucune route client d'un site ne doit rendre.
 */
@QueryHandler(GetMyCompanyBilledToQuery)
export class GetMyCompanyBilledToHandler implements IQueryHandler<
  GetMyCompanyBilledToQuery,
  CustomerBilledToView
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly debtors: MandateDebtorReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetMyCompanyBilledToQuery): Promise<CustomerBilledToView> {
    const role = await this.guard.roleOf(query.actorUserId, query.companyId);
    ensureBankAccountAccess(role, query.companyId);

    const resolved = await this.debtors.resolve(query.companyId, this.clock.now());
    const billedTo = resolved?.billedTo ?? null;
    return { billedTo: billedTo === null ? null : { name: billedTo.name } };
  }
}
