import type { OrderOpeningExemptionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderOpeningExemptionListReader } from "../../domain/ports/order-opening-exemption-list.reader.js";
import { ListOrderOpeningExemptionsQuery } from "./list-order-opening-exemptions.query.js";

/** Sert la liste des exemptions actives à l'écran « Ouverture du e-commerce ». Lecture pure. */
@QueryHandler(ListOrderOpeningExemptionsQuery)
export class ListOrderOpeningExemptionsHandler implements IQueryHandler<
  ListOrderOpeningExemptionsQuery,
  readonly OrderOpeningExemptionView[]
> {
  constructor(private readonly exemptions: OrderOpeningExemptionListReader) {}

  execute(): Promise<readonly OrderOpeningExemptionView[]> {
    return this.exemptions.list();
  }
}
