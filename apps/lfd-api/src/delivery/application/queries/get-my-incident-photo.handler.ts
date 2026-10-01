import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import { DriverRoundsReader } from "../../domain/ports/driver-rounds.reader.js";
import { IncidentPhotosReader } from "../../domain/ports/incident-photos.reader.js";
import { readIncidentPhoto } from "../incident-photo-support.js";
import { GetMyIncidentPhotoQuery } from "./get-my-incident-photo.query.js";

/**
 * La photo d'un signalement de MA tournée. La tournée est lue SOUS LE MUR du
 * livreur ; un signalement d'une autre tournée ne rend rien (404).
 *
 * @throws {DriverRoundNotFoundError} @throws {IncidentPhotoNotFoundError}
 */
@QueryHandler(GetMyIncidentPhotoQuery)
export class GetMyIncidentPhotoHandler implements IQueryHandler<
  GetMyIncidentPhotoQuery,
  StoredDocument
> {
  constructor(
    private readonly rounds: DriverRoundsReader,
    private readonly photos: IncidentPhotosReader,
    private readonly store: ProductionDocumentStore,
  ) {}

  async execute(query: GetMyIncidentPhotoQuery): Promise<StoredDocument> {
    const round = await this.rounds.roundOf(query.staffUserId, query.roundId);
    if (round === null) {
      throw new DriverRoundNotFoundError();
    }
    const ref = await this.photos.photoOf(query.incidentId);
    return readIncidentPhoto(this.store, ref?.roundId === round.id ? ref : null);
  }
}
