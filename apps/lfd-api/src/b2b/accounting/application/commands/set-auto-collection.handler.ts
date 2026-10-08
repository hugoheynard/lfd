import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AutoCollectionChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetAutoCollectionCommand } from "./legal-entity-commands.js";

/**
 * Active ou désactive la constitution automatique de l'entité.
 *
 * Un fait distinct au journal, à chaque bascule réelle : c'est le geste qui
 * fera partir des lots et des avis sans clic (PA3), et « qui l'a activé, et
 * quand » doit se lire seul. Aucune migration ne l'active (plan
 * `prelevement-automatique.md`, § 3).
 */
@CommandHandler(SetAutoCollectionCommand)
export class SetAutoCollectionHandler implements ICommandHandler<SetAutoCollectionCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetAutoCollectionCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    if (!entity.setAutoCollection(command.enabled)) {
      return;
    }
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new AutoCollectionChangedEvent({ id: entity.id, name: entity.name }, at, command.enabled),
      );
    });
  }
}
