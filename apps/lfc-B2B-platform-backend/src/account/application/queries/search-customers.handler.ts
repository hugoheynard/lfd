import type { CustomerLookupView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyMemberReader } from "../../domain/ports/company-member.repository.js";
import { SearchCustomersQuery } from "./search-customers.query.js";

/**
 * Deux caractères minimum : en dessous, la recherche rendrait à peu près tout le
 * fichier, ce qui n'aide personne et fait travailler la base pour rien.
 */
const MIN_TERM_LENGTH = 2;

/** Au-delà, la liste ne s'écrème plus à l'œil : mieux vaut affiner. */
const MAX_RESULTS = 8;

@QueryHandler(SearchCustomersQuery)
export class SearchCustomersHandler implements IQueryHandler<
  SearchCustomersQuery,
  readonly CustomerLookupView[]
> {
  constructor(private readonly members: CompanyMemberReader) {}

  async execute(query: SearchCustomersQuery): Promise<readonly CustomerLookupView[]> {
    const term = query.term.trim();
    if (term.length < MIN_TERM_LENGTH) {
      return [];
    }
    return await this.members.searchCustomers(term, MAX_RESULTS);
  }
}
