import type { CustomerSearchView } from "@lfd/contracts";
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
  CustomerSearchView
> {
  constructor(private readonly members: CompanyMemberReader) {}

  async execute(query: SearchCustomersQuery): Promise<CustomerSearchView> {
    const term = query.term.trim();
    if (term.length < MIN_TERM_LENGTH) {
      return { results: [], truncated: false };
    }
    // On en demande **un de plus** que ce qu'on rend : c'est la seule façon de
    // savoir qu'il en reste, et donc de le dire. Couper en silence ferait
    // conclure au commercial que son client n'existe pas — et il lui ouvrirait
    // un second espace.
    const found = await this.members.searchCustomers(term, MAX_RESULTS + 1);
    return { results: found.slice(0, MAX_RESULTS), truncated: found.length > MAX_RESULTS };
  }
}
