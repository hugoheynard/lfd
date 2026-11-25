import type { AdminBackorderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BackorderListReader } from "../../domain/ports/backorder-list.reader.js";
import { ListBackordersQuery } from "./list-backorders.query.js";

/** Sert la liste « Reliquats à traiter », du plus ancien au plus récent. */
@QueryHandler(ListBackordersQuery)
export class ListBackordersHandler implements IQueryHandler<
  ListBackordersQuery,
  readonly AdminBackorderView[]
> {
  constructor(private readonly backorders: BackorderListReader) {}

  execute(query: ListBackordersQuery): Promise<readonly AdminBackorderView[]> {
    return this.backorders.list(query.filter);
  }
}
