import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { RevisedRecapsReader } from "../../domain/ports/revised-recaps.reader.js";
import type { RevisedInHouseRecapView } from "./in-house-recap.views.js";
import { ListRevisedInHouseRecapsQuery } from "./list-revised-in-house-recaps.query.js";

/** Ce qui attend un « Réémettre », tous payeurs (D8). */
@QueryHandler(ListRevisedInHouseRecapsQuery)
export class ListRevisedInHouseRecapsHandler implements IQueryHandler<
  ListRevisedInHouseRecapsQuery,
  readonly RevisedInHouseRecapView[]
> {
  constructor(private readonly revised: RevisedRecapsReader) {}

  execute(): Promise<readonly RevisedInHouseRecapView[]> {
    return this.revised.revised();
  }
}
