import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityCorrectedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { LegalAddress } from "../../domain/value-objects/legal-address.js";
import { loadOrFail } from "../legal-entity-support.js";
import { CorrectLegalEntityCommand } from "./legal-entity-commands.js";

/**
 * Corrige l'identité légale et l'adresse — **et ne réécrit rien de ce qui est
 * parti**.
 *
 * C'est la raison d'être du `CreditorSnapshot` : un mandat signé en 2026 porte
 * l'adresse de 2026, et le jour où le siège déménage, le papier que le client a
 * dans son classeur continue de dire ce qu'il dit. Sans la copie, corriger une
 * fiche réécrirait rétroactivement des documents opposables.
 *
 * Le SIREN n'est pas corrigible ici, et ce n'est pas un oubli : changer de SIREN
 * n'est pas une correction de saisie, c'est une autre personne morale.
 */
@CommandHandler(CorrectLegalEntityCommand)
export class CorrectLegalEntityHandler implements ICommandHandler<CorrectLegalEntityCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectLegalEntityCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const { payload } = command;
    entity.correctIdentity({
      name: payload.name,
      legalForm: payload.legalForm,
      rcs: payload.rcs,
      shareCapitalCents: payload.shareCapitalCents,
      vatNumber: payload.vatNumber,
    });
    entity.moveTo(LegalAddress.create(payload.address));

    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      // Ce que le journal seul peut dire : QUAND la fiche a changé — ce qui date
      // les documents produits de part et d'autre de la correction.
      await this.events.publishTraced(
        new LegalEntityCorrectedEvent(command.legalEntityId, at, payload.name),
      );
    });
  }
}
