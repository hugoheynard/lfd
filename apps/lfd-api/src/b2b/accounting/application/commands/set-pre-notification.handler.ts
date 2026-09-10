import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PreNotificationChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetPreNotificationCommand } from "./legal-entity-commands.js";

/**
 * Règle le délai annoncé au débiteur entre la pré-notification et le débit.
 *
 * **De la donnée, pas de la configuration de déploiement** : il se négocie avec
 * la banque, il peut différer d'une entité à l'autre, et le renégocier doit être
 * une saisie. Dans une variable d'environnement, il serait unique pour tout le
 * système et changerait par un déploiement — deux propriétés fausses.
 *
 * Les bornes vivent dans l'agrégat. Le contrat les recopie pour le champ de
 * saisie, mais c'est ici que le refus est opposable.
 */
@CommandHandler(SetPreNotificationCommand)
export class SetPreNotificationHandler implements ICommandHandler<SetPreNotificationCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPreNotificationCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    entity.setPreNotificationDays(command.days);

    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new PreNotificationChangedEvent(command.legalEntityId, at, command.days),
      );
    });
  }
}
