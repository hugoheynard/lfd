import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  CustomerAccessOverviewReader,
  type CustomerAccessRowView,
} from "../../domain/ports/customer-access-overview.reader.js";
import { ListCustomerAccessQuery } from "./list-customer-access.query.js";

/**
 * Rend la table telle que le reader la lit. L'ordre d'affichage (état, puis
 * société) appartient à l'écran, qui le refait après chaque filtre.
 */
@QueryHandler(ListCustomerAccessQuery)
export class ListCustomerAccessHandler implements IQueryHandler<
  ListCustomerAccessQuery,
  readonly CustomerAccessRowView[]
> {
  constructor(private readonly overview: CustomerAccessOverviewReader) {}

  execute(): Promise<readonly CustomerAccessRowView[]> {
    return this.overview.list();
  }
}
