import type { CollectionCycleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionBatchReader } from "../../domain/ports/collection-batch.reader.js";
import { GetCollectionCycleQuery } from "./collection-batch-queries.js";

/** Les lots d'une entité et les commandes écartées — l'écran du cycle. */
@QueryHandler(GetCollectionCycleQuery)
export class GetCollectionCycleHandler implements IQueryHandler<
  GetCollectionCycleQuery,
  CollectionCycleView
> {
  constructor(private readonly batches: CollectionBatchReader) {}

  async execute(query: GetCollectionCycleQuery): Promise<CollectionCycleView> {
    const [batches, exclusions] = await Promise.all([
      this.batches.list(query.legalEntityId),
      this.batches.exclusions(),
    ]);
    return { batches, exclusions };
  }
}
