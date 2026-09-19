import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryZoneNotFoundError } from "../domain/delivery-zone-errors.js";
import { DeliveryZoneRemovedEvent } from "../domain/delivery-zone.events.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { RemoveDeliveryZoneCommand } from "./remove-delivery-zone.command.js";

/**
 * Handler **staff** : retire une zone de livraison. Mince : délègue au
 * repository.
 *
 * La zone est lue avant d'être retirée, pour que le fait garde son nom (D6 du
 * plan des phrases) : après, il n'y a plus rien à lire.
 */
@CommandHandler(RemoveDeliveryZoneCommand)
export class RemoveDeliveryZoneHandler implements ICommandHandler<RemoveDeliveryZoneCommand, void> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDeliveryZoneCommand): Promise<void> {
    await this.uow.run(async () => {
      const zone = await this.zones.findById(command.id);
      if (zone === null) {
        throw new DeliveryZoneNotFoundError(command.id);
      }
      await this.zones.remove(command.id);
      await this.events.publishTraced(new DeliveryZoneRemovedEvent(command.id, zone.label));
    });
  }
}
