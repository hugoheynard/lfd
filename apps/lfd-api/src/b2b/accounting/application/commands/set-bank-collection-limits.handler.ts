import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BankCollectionLimitsSetEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetBankCollectionLimitsCommand } from "./legal-entity-commands.js";

/**
 * Règle les plafonds de la banque d'une entité, pour un schéma.
 *
 * La forme des montants est refusée par l'agrégat ; ce handler charge,
 * appelle, sauve et journalise — seulement si quelque chose a changé. Aucun
 * plafond ne bloque rien : ils n'avertissent qu'à la lecture de la procédure
 * (PL2, décision Q1 du 2026-10-24).
 */
@CommandHandler(SetBankCollectionLimitsCommand)
export class SetBankCollectionLimitsHandler implements ICommandHandler<
  SetBankCollectionLimitsCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetBankCollectionLimitsCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const { scheme, perDebitCents, perRemittanceCents, monthlyCents } = command.payload;
    const changed = entity.setBankCollectionLimits(scheme, {
      perDebitCents,
      perRemittanceCents,
      monthlyCents,
    });
    if (!changed) {
      return;
    }
    const at = this.clock.now();
    const limits = entity.bankCollectionLimits(scheme);
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new BankCollectionLimitsSetEvent({ id: entity.id, name: entity.name }, at, scheme, {
          perDebitCents: limits.perDebitCents,
          perRemittanceCents: limits.perRemittanceCents,
          monthlyCents: limits.monthlyCents,
        }),
      );
    });
  }
}
