import type { ExemptibleCompanyView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ExemptibleCompaniesReader } from "../../domain/ports/exemptible-companies.reader.js";
import { ListExemptibleCompaniesQuery } from "./list-exemptible-companies.query.js";

/** Sert le sélecteur de société de l'écran admin. Lecture pure. */
@QueryHandler(ListExemptibleCompaniesQuery)
export class ListExemptibleCompaniesHandler implements IQueryHandler<
  ListExemptibleCompaniesQuery,
  readonly ExemptibleCompanyView[]
> {
  constructor(private readonly companies: ExemptibleCompaniesReader) {}

  execute(): Promise<readonly ExemptibleCompanyView[]> {
    return this.companies.list();
  }
}
