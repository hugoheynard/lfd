import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityArchivalChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetLegalEntityArchivedCommand } from "./legal-entity-commands.js";

/**
 * Archive une entité, ou la remet en service.
 *
 * **Jamais de suppression physique.** Une entité citée par un mandat signé ou
 * par une facture émise ne s'efface pas : le document garde son identifiant, et
 * un `DELETE` transformerait une référence en trou. Archiver dit « elle n'émet
 * plus » sans rien retirer à ce qu'elle a émis.
 *
 * Un seul handler pour les deux sens : ce sont les deux positions d'une même
 * bascule, et deux handlers jumeaux auraient divergé au premier ajout de règle.
 */
@CommandHandler(SetLegalEntityArchivedCommand)
export class SetLegalEntityArchivedHandler implements ICommandHandler<
  SetLegalEntityArchivedCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetLegalEntityArchivedCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const at = this.clock.now();
    if (command.archived) {
      entity.archive(at);
    } else {
      entity.restore();
    }

    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new LegalEntityArchivalChangedEvent(command.legalEntityId, at, command.archived),
      );
    });
  }
}
