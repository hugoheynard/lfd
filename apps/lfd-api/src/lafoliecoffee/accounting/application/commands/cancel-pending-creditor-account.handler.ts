import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CreditorAccountProposalCancelledEvent } from "../../domain/events/creditor-account-review.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { CancelPendingCreditorAccountCommand } from "./legal-entity-commands.js";

/**
 * Annule une modification du compte en attente ; le compte confirmé ne bouge
 * pas. Refusée (409) si la saisie désignée n'attend plus — remplacée,
 * confirmée ou déjà annulée.
 */
@CommandHandler(CancelPendingCreditorAccountCommand)
export class CancelPendingCreditorAccountHandler implements ICommandHandler<
  CancelPendingCreditorAccountCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelPendingCreditorAccountCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const cancelled = entity.cancelPendingCreditorAccount(command.pendingId);
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new CreditorAccountProposalCancelledEvent(
          { id: entity.id, name: entity.name },
          cancelled,
          at,
        ),
      );
    });
  }
}
