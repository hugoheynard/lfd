import type { CustomerRequestView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CustomerRequestReader } from "../../domain/ports/customer-request.reader.js";
import { ListCustomerRequestsQuery } from "./list-customer-requests.query.js";

/**
 * Combien de demandes une liste rend au plus. « À traiter » vise zéro ;
 * « traitées » se lit par le haut, et l'ancien s'anonymise de toute façon.
 */
export const CUSTOMER_REQUESTS_LIST_LIMIT = 200;

/**
 * Sert la boîte « Demandes clients » au back-office. Lecture pure. Le badge
 * et le compteur de menu lisent LA MÊME requête (`status=pending`, sans
 * `kind`) — §6.8.
 */
@QueryHandler(ListCustomerRequestsQuery)
export class ListCustomerRequestsHandler implements IQueryHandler<
  ListCustomerRequestsQuery,
  CustomerRequestView[]
> {
  constructor(private readonly requests: CustomerRequestReader) {}

  execute(query: ListCustomerRequestsQuery): Promise<CustomerRequestView[]> {
    return this.requests.list(query.status, query.kind, CUSTOMER_REQUESTS_LIST_LIMIT);
  }
}
