import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionBatchNotFoundError } from "../../domain/errors/collection-errors.js";
import { CollectionBatchReader } from "../../domain/ports/collection-batch.reader.js";
import { batchAuditCsv } from "../../domain/services/collection-batch-csv.js";
import { cycleTagOf } from "../../domain/services/pain008-document.js";
import { ExportCollectionBatchAuditQuery } from "./collection-batch-queries.js";

export interface CollectionBatchAudit {
  readonly csv: string;
  readonly fileName: string;
}

/** Le CSV de contrôle d'un lot, rendu depuis `collection_batch_line` (plan §2). */
@QueryHandler(ExportCollectionBatchAuditQuery)
export class ExportCollectionBatchAuditHandler implements IQueryHandler<
  ExportCollectionBatchAuditQuery,
  CollectionBatchAudit
> {
  constructor(private readonly batches: CollectionBatchReader) {}

  async execute(query: ExportCollectionBatchAuditQuery): Promise<CollectionBatchAudit> {
    const file = await this.batches.file(query.batchId);
    if (file === null) {
      throw new CollectionBatchNotFoundError(query.batchId);
    }
    const lines = await this.batches.auditLines(query.batchId);
    return {
      csv: batchAuditCsv(lines),
      fileName: `CONTROLE-prelevement-${file.scheme}-${file.creditorSiren}-${cycleTagOf(file.cycleClosesAt)}-${file.batchId}.csv`,
    };
  }
}
