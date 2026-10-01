import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { IncidentPhotosReader } from "../../domain/ports/incident-photos.reader.js";
import { readIncidentPhoto } from "../incident-photo-support.js";
import { GetIncidentPhotoQuery } from "./get-incident-photo.query.js";

/**
 * La photo d'un signalement, ouverte par l'admin depuis Tournées ou « Non
 * remis ». Une lecture.
 *
 * @throws {IncidentPhotoNotFoundError}
 */
@QueryHandler(GetIncidentPhotoQuery)
export class GetIncidentPhotoHandler implements IQueryHandler<
  GetIncidentPhotoQuery,
  StoredDocument
> {
  constructor(
    private readonly photos: IncidentPhotosReader,
    private readonly store: ProductionDocumentStore,
  ) {}

  async execute(query: GetIncidentPhotoQuery): Promise<StoredDocument> {
    return readIncidentPhoto(this.store, await this.photos.photoOf(query.incidentId));
  }
}
