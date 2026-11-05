import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { PublicSettingsEdgeCache } from "../../../b2b/shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryZoneCreatedEvent } from "../domain/delivery-zone.events.js";
import { deliveryPricingTermsOf } from "../domain/delivery-audience-terms.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { CreateDeliveryZoneCommand } from "./create-delivery-zone.command.js";

/**
 * Handler **staff** : crée une zone de livraison. Mince : délègue au repository.
 *
 * Les réglages publics gardés par Workers Cache sont purgés **après** la
 * validation (`AfterCommit`) : une écriture refusée ne purge rien, et l'échec
 * de la purge est journalisé sans retenir l'écriture.
 */
@CommandHandler(CreateDeliveryZoneCommand)
export class CreateDeliveryZoneHandler implements ICommandHandler<
  CreateDeliveryZoneCommand,
  string
> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
  ) {}

  async execute(command: CreateDeliveryZoneCommand): Promise<string> {
    // Les remplacements par audience (0a) : refusés AVANT toute écriture.
    if (command.payload.audienceTerms !== undefined) {
      deliveryPricingTermsOf(command.payload.audienceTerms);
    }
    return await this.uow.run(async () => {
      const zoneId = await this.zones.create(command.payload);
      await this.events.publishTraced(new DeliveryZoneCreatedEvent(zoneId, command.payload));
      this.afterCommit.defer(() => this.edge.purge(), "delivery-zone.edge-purge");
      return zoneId;
    });
  }
}
