import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  CollectionTestFileTamperedError,
  CollectionTestNotFoundError,
} from "../../domain/errors/collection-test-errors.js";
import { CollectionTestFileReader } from "../../domain/ports/collection-test-file.reader.js";
import { sha256Of } from "../../domain/services/collection-batch-file.js";
import { ExportCollectionTestFileQuery } from "./collection-test-queries.js";

export interface CollectionTestFile {
  readonly xml: string;
  readonly fileName: string;
}

/**
 * Rend le fichier **gardé** d'un essai, après avoir vérifié son empreinte —
 * comme le fichier d'un lot. Le nom commence par `ESSAI-` : un fichier rangé
 * sur un bureau perd son contexte, jamais son nom.
 */
@QueryHandler(ExportCollectionTestFileQuery)
export class ExportCollectionTestFileHandler implements IQueryHandler<
  ExportCollectionTestFileQuery,
  CollectionTestFile
> {
  constructor(private readonly files: CollectionTestFileReader) {}

  async execute(query: ExportCollectionTestFileQuery): Promise<CollectionTestFile> {
    const file = await this.files.fileOf(query.testId);
    if (file === null) {
      throw new CollectionTestNotFoundError(query.testId);
    }
    if (sha256Of(file.xml) !== file.sha256) {
      throw new CollectionTestFileTamperedError(file.messageId);
    }
    return { xml: file.xml, fileName: `ESSAI-prelevement-${file.messageId}.xml` };
  }
}
