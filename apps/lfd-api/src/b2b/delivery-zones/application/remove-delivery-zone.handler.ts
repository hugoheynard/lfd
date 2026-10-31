import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  DeliveryZoneNotFoundError,
  DeliveryZoneTargetedByPromotionError,
} from "../domain/delivery-zone-errors.js";
import { DeliveryZoneRemovedEvent } from "../domain/delivery-zone.events.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { DeliveryZoneLock } from "../domain/ports/delivery-zone-lock.js";
import { PromotionsTargetingZoneReader } from "../domain/ports/promotions-targeting-zone.reader.js";
import { RemoveDeliveryZoneCommand } from "./remove-delivery-zone.command.js";

/**
 * Handler **staff** : retire une zone de livraison. Mince : délègue au
 * repository.
 *
 * La zone est lue avant d'être retirée, pour que le fait garde son nom (D6 du
 * plan des phrases) : après, il n'y a plus rien à lire.
 *
 * Une zone qu'une promotion nomme, archivée comprise, ne se supprime pas
 * (`documentation/promotions/promotions.md`, § 2.14) :
 * contrôle et suppression dans la même transaction, la zone verrouillée.
 *
 * @throws {DeliveryZoneNotFoundError} la zone n'existe pas.
 * @throws {DeliveryZoneTargetedByPromotionError} une promotion la nomme.
 */
@CommandHandler(RemoveDeliveryZoneCommand)
export class RemoveDeliveryZoneHandler implements ICommandHandler<RemoveDeliveryZoneCommand, void> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly lock: DeliveryZoneLock,
    private readonly promotions: PromotionsTargetingZoneReader,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDeliveryZoneCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.lock(command.id);
      const zone = await this.zones.findById(command.id);
      if (zone === null) {
        throw new DeliveryZoneNotFoundError(command.id);
      }
      const [first] = await this.promotions.targeting(command.id);
      if (first !== undefined) {
        throw new DeliveryZoneTargetedByPromotionError(first.name, first.archived);
      }
      await this.zones.remove(command.id);
      await this.events.publishTraced(new DeliveryZoneRemovedEvent(command.id, zone.label));
    });
  }
}
