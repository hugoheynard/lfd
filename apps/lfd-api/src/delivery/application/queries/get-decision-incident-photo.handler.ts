import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { DecisionIncidentPhotosReader } from "../../domain/ports/decision-incident-photos.reader.js";
import { readIncidentPhoto } from "../incident-photo-support.js";
import { GetDecisionIncidentPhotoQuery } from "./get-decision-incident-photo.query.js";

/**
 * La photo d'un signalement qui a ouvert une décision vivante — ce que le
 * commercial regarde avant d'autoriser le dépôt ou de rapporter (B3). Le mur
 * est dans le port. Une lecture.
 *
 * @throws {IncidentPhotoNotFoundError} hors d'une décision vivante, ou sans photo.
 */
@QueryHandler(GetDecisionIncidentPhotoQuery)
export class GetDecisionIncidentPhotoHandler implements IQueryHandler<
  GetDecisionIncidentPhotoQuery,
  StoredDocument
> {
  constructor(
    private readonly photos: DecisionIncidentPhotosReader,
    private readonly store: ProductionDocumentStore,
  ) {}

  async execute(query: GetDecisionIncidentPhotoQuery): Promise<StoredDocument> {
    return readIncidentPhoto(this.store, await this.photos.photoOf(query.stopId, query.incidentId));
  }
}
