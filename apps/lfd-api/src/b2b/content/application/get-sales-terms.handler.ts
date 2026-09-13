import type { SalesTermsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { GetSalesTermsQuery } from "./get-sales-terms.query.js";

/**
 * Sert les CGV. Lecture pure, et qui aboutit toujours : sans ligne en base, le
 * port rend le document de départ en révision zéro.
 */
@QueryHandler(GetSalesTermsQuery)
export class GetSalesTermsHandler implements IQueryHandler<GetSalesTermsQuery, SalesTermsView> {
  constructor(private readonly content: PlatformContentRepository) {}

  execute(): Promise<SalesTermsView> {
    return this.content.readSalesTerms();
  }
}
