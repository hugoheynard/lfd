import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  BatchFileTamperedError,
  CollectionBatchNotFoundError,
} from "../../domain/errors/collection-errors.js";
import { CollectionBatchReader } from "../../domain/ports/collection-batch.reader.js";
import { sha256Of } from "../../domain/services/collection-batch-file.js";
import { cycleTagOf } from "../../domain/services/pain008-document.js";
import { ExportCollectionBatchFileQuery } from "./collection-batch-queries.js";

export interface CollectionBatchFile {
  readonly xml: string;
  readonly fileName: string;
}

/**
 * Rend le fichier **stocké** d'un lot, après avoir vérifié son empreinte (plan
 * §2). Deux téléchargements rendent les mêmes octets — c'est tout l'objet du
 * lot figé (T10, T17).
 *
 * Le nom dit l'état : `BROUILLON-` pour un lot indéposable, `ANNULE-` pour un
 * lot annulé — un fichier rangé sur un bureau perd son contexte, jamais son nom.
 */
@QueryHandler(ExportCollectionBatchFileQuery)
export class ExportCollectionBatchFileHandler implements IQueryHandler<
  ExportCollectionBatchFileQuery,
  CollectionBatchFile
> {
  constructor(private readonly batches: CollectionBatchReader) {}

  async execute(query: ExportCollectionBatchFileQuery): Promise<CollectionBatchFile> {
    const file = await this.batches.file(query.batchId);
    if (file === null) {
      throw new CollectionBatchNotFoundError(query.batchId);
    }
    if (sha256Of(file.xml) !== file.fileSha256) {
      throw new BatchFileTamperedError(file.batchId);
    }
    const prefix = file.status === "cancelled" ? "ANNULE-" : file.depositable ? "" : "BROUILLON-";
    return {
      xml: file.xml,
      fileName: `${prefix}prelevement-${file.scheme}-${file.creditorSiren}-${cycleTagOf(file.cycleClosesAt)}-${file.batchId}.xml`,
    };
  }
}
