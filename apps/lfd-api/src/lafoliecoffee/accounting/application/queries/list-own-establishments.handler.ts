import type { OwnEstablishmentsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { OwnEstablishmentsReader } from "../../domain/ports/own-establishments.reader.js";
import { ListOwnEstablishmentsQuery } from "./collection-test-queries.js";

/** Nos établissements, avec qui les a déclarés et quand. */
@QueryHandler(ListOwnEstablishmentsQuery)
export class ListOwnEstablishmentsHandler implements IQueryHandler<
  ListOwnEstablishmentsQuery,
  OwnEstablishmentsView
> {
  constructor(
    private readonly establishments: OwnEstablishmentsReader,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(): Promise<OwnEstablishmentsView> {
    const rows = await this.establishments.list();
    const authors = await this.authors.identify(rows.map((row) => row.declaredByStaffId));
    return {
      establishments: rows.map((row) => ({
        companyId: row.companyId,
        companyName: row.companyName,
        companyStatus: row.companyStatus,
        declaredAt: row.declaredAt.toISOString(),
        declaredByName: authors.nameOf(row.declaredByStaffId),
      })),
    };
  }
}
