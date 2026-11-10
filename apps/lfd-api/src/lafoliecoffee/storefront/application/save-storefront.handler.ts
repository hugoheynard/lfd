import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StorefrontSavedEvent } from "../domain/storefront.events.js";
import { StorefrontRepository } from "../domain/storefront.repository.js";
import { SaveStorefrontCommand } from "./save-storefront.command.js";
import { compositionOf } from "./storefront-composition.js";

/**
 * Enregistre la vitrine entière (plan, D6).
 *
 * Le handler **n'arbitre rien** : les value objects refusent une donnée mal
 * formée, l'agrégat refuse chevauchement, débordement et révision périmée,
 * l'adaptateur tient le verrou en base. Ce qui est ici, c'est l'orchestration
 * — composer, charger, appliquer, écrire, tracer — dans une seule unité de
 * travail, pour que la trace tombe avec la vitrine qu'elle décrit.
 */
@CommandHandler(SaveStorefrontCommand)
export class SaveStorefrontHandler implements ICommandHandler<SaveStorefrontCommand, void> {
  constructor(
    private readonly storefronts: StorefrontRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * @throws {InvalidStorefrontError} la composition ne tient pas.
   * @throws {StorefrontObjectUnknownError} un objet ou un gabarit cité n'est plus là.
   * @throws {StorefrontChangedError} quelqu'un a enregistré depuis le chargement.
   */
  async execute(command: SaveStorefrontCommand): Promise<void> {
    const composition = compositionOf(command.payload, this.ids);
    await this.uow.run(async () => {
      const storefront = await this.storefronts.load();
      const changes = storefront.compose(composition, {
        at: this.clock.now(),
        staffId: command.staffUserId,
      });
      await this.storefronts.save(storefront);
      await this.events.publishTraced(new StorefrontSavedEvent(storefront.revision, changes));
    });
  }
}
