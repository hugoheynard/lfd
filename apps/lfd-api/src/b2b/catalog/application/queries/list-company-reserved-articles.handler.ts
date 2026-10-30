import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CompanyReservedArticlesView } from "@lfd/contracts";

import { ReservationCompanyNotFoundError } from "../../domain/errors/made-to-order-errors.js";
import { MadeToOrderAdminReader } from "../../domain/ports/made-to-order-admin.reader.js";
import { ListCompanyReservedArticlesQuery } from "./list-company-reserved-articles.query.js";

/**
 * La section « Articles réservés » de la fiche client (plan
 * `plan-articles-sur-mesure.md`, § 7) : les siens, et ceux de son principal,
 * en lecture seule.
 *
 * @throws {ReservationCompanyNotFoundError} la société n'existe pas.
 */
@QueryHandler(ListCompanyReservedArticlesQuery)
export class ListCompanyReservedArticlesHandler implements IQueryHandler<
  ListCompanyReservedArticlesQuery,
  CompanyReservedArticlesView
> {
  constructor(private readonly reader: MadeToOrderAdminReader) {}

  async execute(query: ListCompanyReservedArticlesQuery): Promise<CompanyReservedArticlesView> {
    const view = await this.reader.ofCompany(query.companyId);
    if (view === null) {
      throw new ReservationCompanyNotFoundError(query.companyId);
    }
    return view;
  }
}
