import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CreditorIdentifierAssignedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { CreditorIdentifier } from "../../domain/value-objects/creditor-identifier.js";
import { loadOrFail } from "../legal-entity-support.js";
import { AssignCreditorIdentifierCommand } from "./legal-entity-commands.js";

/**
 * Attribue l'**ICS** — le geste sans retour de tout le contexte.
 *
 * L'agrégat refuse de le remplacer, et cette règle n'est pas une prudence
 * décorative : chaque mandat signé porte l'ICS **imprimé sur le papier**. Le
 * changer ici n'irait pas rechercher les signatures — on prélèverait sous un
 * identifiant que le débiteur n'a jamais autorisé, et chaque opération
 * deviendrait contestable. Un ICS qui change est une nouvelle entité émettrice.
 *
 * Rejouer la **même** valeur est accepté : une saisie renvoyée deux fois par un
 * double-clic n'est pas une faute, et la refuser afficherait une erreur là où
 * rien n'a mal tourné.
 *
 * @throws {CreditorIdentifierIsImmutableError} un AUTRE ICS est déjà en place.
 */
@CommandHandler(AssignCreditorIdentifierCommand)
export class AssignCreditorIdentifierHandler implements ICommandHandler<
  AssignCreditorIdentifierCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AssignCreditorIdentifierCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const ics = CreditorIdentifier.create(command.ics);
    entity.assignCreditorIdentifier(ics);

    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new CreditorIdentifierAssignedEvent(command.legalEntityId, at, ics.value),
      );
    });
  }
}
