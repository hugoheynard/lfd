import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CreditorAccountConfirmedEvent } from "../../domain/events/creditor-account-review.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { Iban } from "../../domain/value-objects/iban.js";
import { loadOrFail } from "../legal-entity-support.js";
import { ConfirmCreditorAccountCommand } from "./legal-entity-commands.js";

/**
 * Confirme une modification du compte de l'entité : un SECOND membre de la
 * comptabilité ressaisit l'IBAN depuis le RIB de la banque, et la proposition
 * devient le compte que factures, lots et mandats liront.
 *
 * Les refus sont tous dans l'agrégat (`LegalEntity.confirmCreditorAccount`) ;
 * l'IBAN ressaisi passe d'abord par `Iban.create`, qui refuse une clé mod-97
 * fausse en 400 — sans dire, là non plus, où la saisie diffère. Une écriture
 * concurrente sur l'entité est refusée par le verrou de version de `save`.
 */
@CommandHandler(ConfirmCreditorAccountCommand)
export class ConfirmCreditorAccountHandler implements ICommandHandler<
  ConfirmCreditorAccountCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ConfirmCreditorAccountCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const confirmed = entity.confirmCreditorAccount(
      command.pendingId,
      Iban.create(command.iban),
      command.staffId,
    );
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new CreditorAccountConfirmedEvent({ id: entity.id, name: entity.name }, confirmed, at),
      );
    });
  }
}
