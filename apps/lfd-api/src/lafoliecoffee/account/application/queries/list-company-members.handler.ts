import type { CompanyMemberView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyMemberReader } from "../../domain/ports/company-member.repository.js";
import { toMemberView } from "./company-member.view.js";
import { ListCompanyMembersQuery } from "./list-company-members.query.js";

@QueryHandler(ListCompanyMembersQuery)
export class ListCompanyMembersHandler implements IQueryHandler<
  ListCompanyMembersQuery,
  readonly CompanyMemberView[]
> {
  constructor(private readonly members: CompanyMemberReader) {}

  async execute(query: ListCompanyMembersQuery): Promise<readonly CompanyMemberView[]> {
    const records = await this.members.listOf(query.companyId);
    return records.map(toMemberView);
  }
}
