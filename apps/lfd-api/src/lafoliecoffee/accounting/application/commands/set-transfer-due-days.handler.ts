import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { TransferDueDaysChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetTransferDueDaysCommand } from "./legal-entity-commands.js";

/**
 * Règle l'échéance des factures au virement de l'entité (V6).
 *
 * Les bornes vivent dans l'agrégat. Un fait au journal à chaque changement
 * réel ; une saisie rejouée n'écrit rien. Aucune facture émise n'est relue :
 * chacune a figé son échéance à l'émission.
 */
@CommandHandler(SetTransferDueDaysCommand)
export class SetTransferDueDaysHandler implements ICommandHandler<SetTransferDueDaysCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetTransferDueDaysCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    if (!entity.setTransferDueDays(command.days)) {
      return;
    }
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new TransferDueDaysChangedEvent({ id: entity.id, name: entity.name }, at, command.days),
      );
    });
  }
}
