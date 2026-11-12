import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { PublicSettingsEdgeCache } from "../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { DeliveryZoneCreatedEvent } from "../domain/delivery-zone.events.js";
import { deliveryPricingTermsOf } from "../domain/delivery-audience-terms.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { CreateDeliveryZoneCommand } from "./create-delivery-zone.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const CREATE_ZONE_GESTURE = "delivery-zones.create";

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
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est scellée avec la zone et
   * son fait ; un double clic rend la zone déjà créée, sans seconde zone, ni
   * second fait, ni seconde purge.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour une autre zone.
   */
  execute(command: CreateDeliveryZoneCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: CREATE_ZONE_GESTURE,
        subject: intentSubject("delivery-zone", command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.create(command, seal),
    );
  }

  private async create(
    command: CreateDeliveryZoneCommand,
    seal: (zoneId: string) => Promise<void>,
  ): Promise<string> {
    // Les remplacements par audience (0a) : refusés AVANT toute écriture.
    if (command.payload.audienceTerms !== undefined) {
      deliveryPricingTermsOf(command.payload.audienceTerms);
    }
    return await this.uow.run(async () => {
      const zoneId = await this.zones.create(command.payload);
      await this.events.publishTraced(new DeliveryZoneCreatedEvent(zoneId, command.payload));
      this.afterCommit.defer(() => this.edge.purge(), "delivery-zone.edge-purge");
      await seal(zoneId);
      return zoneId;
    });
  }
}
