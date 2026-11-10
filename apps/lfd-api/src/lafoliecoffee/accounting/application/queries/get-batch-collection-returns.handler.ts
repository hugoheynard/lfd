import type { BatchCollectionReturnsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionReturnsReader } from "../../domain/ports/collection-returns.reader.js";
import { MandateRecheckReader } from "../../domain/ports/mandate-recheck.reader.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { BANK_RETURN_REASONS } from "../../domain/value-objects/bank-return-reason.js";
import { returnViews } from "../collection-return-view-support.js";
import { GetBatchCollectionReturnsQuery } from "./collection-return-queries.js";

/**
 * **Les retours d'un lot** (R5a), le plus récent d'abord, et la liste fermée
 * des motifs pour en saisir un. Un lot inconnu rend une liste vide : l'écran
 * ne demande que les lots qu'il a lus.
 */
@QueryHandler(GetBatchCollectionReturnsQuery)
export class GetBatchCollectionReturnsHandler implements IQueryHandler<
  GetBatchCollectionReturnsQuery,
  BatchCollectionReturnsView
> {
  constructor(
    private readonly returns: CollectionReturnsReader,
    private readonly lines: ReturnableLinesReader,
    private readonly mandates: MandateRecheckReader,
  ) {}

  async execute(query: GetBatchCollectionReturnsQuery): Promise<BatchCollectionReturnsView> {
    const rows = await this.returns.ofBatch(query.batchId);
    return {
      returns: await returnViews({ lines: this.lines, mandates: this.mandates }, rows),
      reasons: BANK_RETURN_REASONS,
    };
  }
}
