import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionTestFileNotFoundError } from "../../domain/errors/collection-test-file-errors.js";
import { CollectionTestFileReader } from "../../domain/ports/collection-test-file.reader.js";
import {
  verifiedTestFile,
  type CollectionTestFileDownload,
} from "../collection-test-file-support.js";
import { ExportCollectionTestFileQuery } from "./collection-test-queries.js";

/** Rend le fichier gardé d'un envoi d'essai, empreinte vérifiée. */
@QueryHandler(ExportCollectionTestFileQuery)
export class ExportCollectionTestFileHandler implements IQueryHandler<
  ExportCollectionTestFileQuery,
  CollectionTestFileDownload
> {
  constructor(private readonly files: CollectionTestFileReader) {}

  async execute(query: ExportCollectionTestFileQuery): Promise<CollectionTestFileDownload> {
    const file = await this.files.fileOf(query.fileId);
    if (file === null) {
      throw new CollectionTestFileNotFoundError(query.fileId);
    }
    return verifiedTestFile(file);
  }
}
