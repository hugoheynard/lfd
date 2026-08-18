import type { CompanyAddressesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyAddressReader } from "../../domain/ports/company-address.reader.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { ListCompanyAddressesQuery } from "./list-company-addresses.query.js";

/** Sert les adresses d'une entreprise à l'un de ses membres (mur « membre »). */
@QueryHandler(ListCompanyAddressesQuery)
export class ListCompanyAddressesHandler implements IQueryHandler<
  ListCompanyAddressesQuery,
  CompanyAddressesView
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressReader,
  ) {}

  async execute(query: ListCompanyAddressesQuery): Promise<CompanyAddressesView> {
    const role = await this.memberships.roleOf(query.actorUserId, query.companyId);
    ensureCompanyMember(role, query.companyId);

    return this.addresses.read(query.companyId);
  }
}
