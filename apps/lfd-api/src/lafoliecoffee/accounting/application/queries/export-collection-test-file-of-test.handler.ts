import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionTestNotFoundError } from "../../domain/errors/collection-test-errors.js";
import { CollectionTestFileReader } from "../../domain/ports/collection-test-file.reader.js";
import {
  verifiedTestFile,
  type CollectionTestFileDownload,
} from "../collection-test-file-support.js";
import { ExportCollectionTestFileOfTestQuery } from "./collection-test-queries.js";

/**
 * Rend le fichier gardé de l'envoi qui porte cet essai — le même que par
 * l'envoi, empreinte vérifiée : une ligne se télécharge par son fichier.
 */
@QueryHandler(ExportCollectionTestFileOfTestQuery)
export class ExportCollectionTestFileOfTestHandler implements IQueryHandler<
  ExportCollectionTestFileOfTestQuery,
  CollectionTestFileDownload
> {
  constructor(private readonly files: CollectionTestFileReader) {}

  async execute(query: ExportCollectionTestFileOfTestQuery): Promise<CollectionTestFileDownload> {
    const file = await this.files.fileOfTest(query.testId);
    if (file === null) {
      throw new CollectionTestNotFoundError(query.testId);
    }
    return verifiedTestFile(file);
  }
}
