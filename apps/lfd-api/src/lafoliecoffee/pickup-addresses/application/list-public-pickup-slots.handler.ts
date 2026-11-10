import { type PublicPickupSlot, publicPickupSlotsFor } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { PublicPickupScheduleReader } from "../domain/public-pickup-schedule.reader.js";
import { ListPublicPickupSlotsQuery } from "./list-public-pickup-slots.query.js";

/**
 * Sert les créneaux publics d'un point pour une journée. Lecture pure.
 *
 * Le point est vérifié d'abord, pour la même raison que la lecture de l'horaire
 * en back-office : sans ça, un identifiant erroné rendrait une liste vide —
 * exactement ce que rend un point ouvert mais non réglé, qui est un état normal.
 * Un visiteur croirait la boutique fermée.
 *
 * 🔴 **`taken` est vide, et ce n'est pas un oubli.** La table des réservations
 * n'existe pas : le lot A ne l'a pas créée, faute d'écrivain comme de lecteur,
 * et une table que personne ne remplit aurait été une dette déguisée en
 * préparation. Conséquence, à connaître avant de lire un écran : aucun créneau
 * ne peut être rendu COMPLET aujourd'hui — `open` vaut toujours vrai, et
 * `nextOpenTime` toujours `null`. Le jour où les réservations arriveront, elles
 * entreront par ce paramètre et l'état s'allumera seul (vérifié le 2026-09-16).
 */
@QueryHandler(ListPublicPickupSlotsQuery)
export class ListPublicPickupSlotsHandler implements IQueryHandler<
  ListPublicPickupSlotsQuery,
  readonly PublicPickupSlot[]
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly schedules: PublicPickupScheduleReader,
    private readonly clock: Clock,
  ) {}

  /** @throws {PickupAddressNotFoundError} le point n'existe pas. */
  async execute(query: ListPublicPickupSlotsQuery): Promise<readonly PublicPickupSlot[]> {
    const point = await this.pickups.resolve(query.pickupAddressId);
    if (point === null) {
      throw new PickupAddressNotFoundError(query.pickupAddressId);
    }
    const schedule = await this.schedules.read(query.pickupAddressId);
    return publicPickupSlotsFor(query.day, schedule.rules, schedule.closures, [], this.clock.now());
  }
}
