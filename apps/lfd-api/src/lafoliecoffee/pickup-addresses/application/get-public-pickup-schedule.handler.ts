import type { PublicPickupScheduleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { PublicPickupScheduleReader } from "../domain/public-pickup-schedule.reader.js";
import { GetPublicPickupScheduleQuery } from "./get-public-pickup-schedule.query.js";

/**
 * Sert l'horaire public d'un point. Lecture pure.
 *
 * Le point est vérifié d'abord, et c'est délibéré : sans ça, un identifiant
 * erroné rendrait deux listes vides — exactement ce que rend un point non réglé,
 * qui est un état normal (D6). L'opérateur croirait avoir perdu sa grille.
 */
@QueryHandler(GetPublicPickupScheduleQuery)
export class GetPublicPickupScheduleHandler implements IQueryHandler<
  GetPublicPickupScheduleQuery,
  PublicPickupScheduleView
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly schedules: PublicPickupScheduleReader,
  ) {}

  /** @throws {PickupAddressNotFoundError} le point n'existe pas. */
  async execute(query: GetPublicPickupScheduleQuery): Promise<PublicPickupScheduleView> {
    const point = await this.pickups.resolve(query.pickupAddressId);
    if (point === null) {
      throw new PickupAddressNotFoundError(query.pickupAddressId);
    }
    return this.schedules.read(query.pickupAddressId);
  }
}
