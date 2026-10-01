import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { DeliveryStepPhotosReader } from "../../channels/commerce/index.js";
import {
  DriverRoundNotFoundError,
  DriverStepPhotoNotFoundError,
} from "../../domain/errors/delivery-driver-errors.js";
import { DriverRoundsReader } from "../../domain/ports/driver-rounds.reader.js";
import { GetMyStopStepPhotoQuery } from "./get-my-stop-step-photo.query.js";

/**
 * **La photo d'une étape, ouverte par le livreur** (plan « Ma tournée »,
 * MT-D5 v2).
 *
 * La tournée est lue SOUS LE MUR du livreur — le même `roundOf` que la vue,
 * donc un 404 ici ne peut pas contredire la page. L'arrêt doit y figurer (non
 * retiré), et la photo est cherchée dans la procédure de l'adresse reliée à
 * SA commande : un `stepId` d'une autre adresse ne rend rien.
 *
 * @throws {DriverRoundNotFoundError} tournée absente ou à un autre.
 * @throws {DriverStepPhotoNotFoundError} arrêt hors de la tournée, étape
 *   d'une autre adresse, ou sans photo.
 */
@QueryHandler(GetMyStopStepPhotoQuery)
export class GetMyStopStepPhotoHandler implements IQueryHandler<
  GetMyStopStepPhotoQuery,
  StoredDocument
> {
  constructor(
    private readonly rounds: DriverRoundsReader,
    private readonly photos: DeliveryStepPhotosReader,
  ) {}

  async execute(query: GetMyStopStepPhotoQuery): Promise<StoredDocument> {
    const round = await this.rounds.roundOf(query.staffUserId, query.roundId);
    if (round === null) {
      throw new DriverRoundNotFoundError();
    }
    const stop = round.stops.find((candidate) => candidate.stopId === query.stopId);
    if (stop === undefined) {
      throw new DriverStepPhotoNotFoundError();
    }
    const photo = await this.photos.photoOf(stop.orderId, query.stepId);
    if (photo === null) {
      throw new DriverStepPhotoNotFoundError();
    }
    return photo;
  }
}
