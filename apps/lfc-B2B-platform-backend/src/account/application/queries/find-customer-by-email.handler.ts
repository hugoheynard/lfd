import type { CustomerLookupView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyMemberReader } from "../../domain/ports/company-member.repository.js";
import { FindCustomerByEmailQuery } from "./find-customer-by-email.query.js";

/**
 * Rend ce qu'on sait d'une personne, ou `null`.
 *
 * `null` plutôt qu'un 404 : « cette adresse nous est inconnue » est la réponse
 * **normale** et la plus fréquente, pas une erreur. Un 404 obligerait chaque
 * appelant à traiter comme un échec le cas nominal.
 */
@QueryHandler(FindCustomerByEmailQuery)
export class FindCustomerByEmailHandler implements IQueryHandler<
  FindCustomerByEmailQuery,
  CustomerLookupView | null
> {
  constructor(private readonly members: CompanyMemberReader) {}

  async execute(query: FindCustomerByEmailQuery): Promise<CustomerLookupView | null> {
    const email = query.email.trim();
    if (email === "") {
      return null;
    }
    return await this.members.findCustomerByEmail(email);
  }
}
