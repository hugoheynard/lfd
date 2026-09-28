import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { QualityPhotoNotFoundError } from "../../domain/errors/quality-record-errors.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { GetQualityPhotoQuery } from "./get-quality-photo.query.js";

/**
 * La ligne de photo dit où est l'objet et de quel type il est — relu dans ses
 * octets au dépôt. Une ligne sans objet est une PANNE (`read` lève) : la base a
 * promis le fichier.
 */
@QueryHandler(GetQualityPhotoQuery)
export class GetQualityPhotoHandler implements IQueryHandler<GetQualityPhotoQuery, StoredDocument> {
  constructor(
    private readonly checks: QualityCheckReader,
    private readonly store: ProductionDocumentStore,
  ) {}

  async execute(query: GetQualityPhotoQuery): Promise<StoredDocument> {
    const photo = await this.checks.photo(query.checkId, query.position);
    if (photo === null) {
      throw new QualityPhotoNotFoundError(query.checkId, query.position);
    }
    const bytes = await this.store.read(photo.storageKey);
    return { bytes, contentType: photo.contentType };
  }
}
