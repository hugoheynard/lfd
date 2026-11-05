import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { PublicSettingsEdgeCache } from "../../../b2b/shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryZoneUpdatedEvent } from "../domain/delivery-zone.events.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { UpdateDeliveryZoneCommand } from "./update-delivery-zone.command.js";

/**
 * Handler **staff** : modifie une zone de livraison. Mince : délègue au repository.
 *
 * Les réglages publics gardés par Workers Cache sont purgés **après** la
 * validation (`AfterCommit`) : une écriture refusée ne purge rien, et l'échec
 * de la purge est journalisé sans retenir l'écriture.
 */
@CommandHandler(UpdateDeliveryZoneCommand)
export class UpdateDeliveryZoneHandler implements ICommandHandler<UpdateDeliveryZoneCommand, void> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
  ) {}

  async execute(command: UpdateDeliveryZoneCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.zones.update(command.id, command.payload);
      await this.events.publishTraced(new DeliveryZoneUpdatedEvent(command.id, command.payload));
      this.afterCommit.defer(() => this.edge.purge(), "delivery-zone.edge-purge");
    });
  }
}
